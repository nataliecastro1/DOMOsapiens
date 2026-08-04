"""
ROI record persistence, backed by the typed `roi_records` table.

This used to keep every record as a JSONB document in a shared collection, and
every save rewrote the entire collection inside one transaction — a full table
rewrite per edit, guarded only by a `threading.Lock` that protected one process
and therefore nothing at all once more than one container was running. Two SMEs
saving different records at the same moment could lose one of the writes.

Now each record is a row. Writes are single-row upserts, and edits take a
row-level lock (`SELECT … FOR UPDATE`), so concurrent edits to *different*
records never contend while concurrent edits to the *same* record serialise.

Postgres is required: there is no file fallback. A container-local file would be
discarded on the next Alfred redeploy, so a save could appear to succeed and
then vanish — failing loudly is the safer failure mode.
"""
import csv
import io
import uuid
from datetime import datetime, timezone

import psycopg
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from models import ROIRecord
from models.field_catalog import FIELD_CATALOG
from services import audit, db, record_columns

# The 15 clean Domo columns (no provenance noise — that lives on its own sheet).
# Order is the Domo ingestion contract, so it's pinned here rather than derived
# from the catalog; the catalog's `notes`/flags for these keys ship in the
# Field_Definitions sheet (see export_xlsx).
DOMO_COLUMNS = [
    "year", "client", "publisher", "date_delivered", "currency",
    "identified_risk", "id_cost_avoidance", "acc_cost_avoidance",
    "id_cost_optimization", "acc_cost_optimization", "realized_savings",
    "contract_spend", "pricing_available", "notes", "elevate_deliverable",
]

# Metric keys that can carry per-field provenance, with client-facing labels —
# derived from the single source of truth (models/field_catalog.py) so the
# export and the Tracker can never drift.
PROVENANCE_METRICS = [(f.key, f.label) for f in FIELD_CATALOG if f.provenance]

_IMMUTABLE = {"record_id", "seq", "saved_at", "updated_at"}

_UPSERT_COLUMNS = ["record_id"] + record_columns.WRITABLE + ["saved_at", "updated_at"]

# `saved_at` is deliberately absent from the DO UPDATE list: re-saving a record
# must not rewrite when it was first created.
_UPSERT_SQL = f"""
INSERT INTO roi_records ({", ".join(_UPSERT_COLUMNS)})
VALUES ({", ".join(f"%({c})s" for c in _UPSERT_COLUMNS)})
ON CONFLICT (record_id) DO UPDATE SET
    {", ".join(f"{c} = EXCLUDED.{c}" for c in record_columns.WRITABLE)},
    updated_at = EXCLUDED.updated_at
RETURNING *
"""


class Conflict(Exception):
    """A write would break a uniqueness guarantee.

    Distinct from a bad request: the payload is well-formed, it just collides
    with another record. Callers map this to 409.
    """


def _conflict_message(exc: Exception) -> str:
    """Turn a Postgres unique violation into something a reviewer can act on."""
    constraint = getattr(getattr(exc, "diag", None), "constraint_name", "") or ""
    if "one_per_deliverable" in constraint:
        return (
            "Another ROI record is already linked to that delivery-hub "
            "deliverable. Each deliverable holds one ROI record — edit the "
            "existing one, or unlink it first."
        )
    if "stored_name" in constraint:
        return "Another record already references that uploaded document."
    return f"This change conflicts with an existing record ({constraint or 'unique constraint'})."


def _new_record_id() -> str:
    return f"r_{uuid.uuid4().hex[:12]}"


def _now():
    return datetime.now(timezone.utc)


def _row_to_dict(row) -> dict:
    """Shape a DB row like the JSON documents callers used to receive."""
    out = dict(row)
    out.pop("seq", None)  # internal ordering key, never part of the API
    for key in ("saved_at", "updated_at"):
        value = out.get(key)
        if hasattr(value, "isoformat"):
            out[key] = value.isoformat()
    return out


def _jsonb(field: str, value):
    """Wrap JSONB column values; leave scalars alone."""
    if field not in record_columns.JSON:
        return value
    return Jsonb(value) if value not in (None, "", {}, []) else None


def _upsert_params(entry: dict, *, saved_at, updated_at) -> dict:
    params = {
        "record_id": entry["record_id"],
        "saved_at": saved_at,
        "updated_at": updated_at,
    }
    for col in record_columns.SCALAR:
        params[col] = entry.get(col)
    for col in record_columns.JSON:
        params[col] = _jsonb(col, entry.get(col))
    # NOT NULL columns must carry a concrete value.
    for col, default in record_columns.NOT_NULL_TEXT_DEFAULTS.items():
        if not params.get(col):
            params[col] = default
    return params


# ── reads ─────────────────────────────────────────────────────────────────────
def get_all_records() -> list[dict]:
    """Every record, in insertion order (what the Tracker expects)."""
    db.require_db()
    with db.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("SELECT * FROM roi_records ORDER BY seq")
            return [_row_to_dict(r) for r in cur.fetchall()]


def get_record(record_id: str) -> dict | None:
    db.require_db()
    with db.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("SELECT * FROM roi_records WHERE record_id = %s", (record_id,))
            row = cur.fetchone()
    return _row_to_dict(row) if row else None


def existing_natural_keys() -> dict[tuple, dict]:
    """Existing (client, publisher, year) keys, for bulk-import duplicate checks.

    Reads only the columns the duplicate report needs, over the
    (client, publisher, year) index, instead of loading every full record.
    """
    db.require_db()
    with db.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT record_id, client, publisher, year, saved_at, source_file, sme,"
                "       identified_risk, acc_cost_avoidance, realized_savings"
                " FROM roi_records"
            )
            rows = cur.fetchall()
    out: dict[tuple, dict] = {}
    for r in rows:
        client = (r["client"] or "").strip().lower()
        publisher = (r["publisher"] or "").strip().lower()
        if client and publisher and r["year"] is not None:
            out[(client, publisher, int(r["year"]))] = _row_to_dict(r)
    return out


# ── writes ────────────────────────────────────────────────────────────────────
def save_record(record: ROIRecord) -> dict:
    """Upsert a record, matching an existing one by stored_name or source_file.

    Assigns a stable record_id, preserves an executive summary the incoming
    payload doesn't carry, and logs one audit event per changed metric.
    """
    db.require_db()
    entry = record.model_dump()
    now = _now()
    changed: list[tuple] = []

    with db.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            with conn.transaction():
                # The ::text casts are required — Postgres cannot infer a
                # parameter's type from `$1 IS NOT NULL` alone.
                cur.execute(
                    "SELECT * FROM roi_records"
                    " WHERE (%(stored_name)s::text IS NOT NULL AND stored_name = %(stored_name)s::text)"
                    "    OR (%(source_file)s::text IS NOT NULL AND source_file = %(source_file)s::text)"
                    " ORDER BY seq LIMIT 1",
                    {
                        "stored_name": entry.get("stored_name"),
                        "source_file": entry.get("source_file"),
                    },
                )
                existing = cur.fetchone()

                if existing:
                    entry["record_id"] = existing["record_id"]
                    if not entry.get("executive_summary") and existing.get("executive_summary"):
                        entry["executive_summary"] = existing["executive_summary"]
                    for field in record_columns.AUDITED:
                        old, new = existing.get(field), entry.get(field)
                        if old != new:
                            changed.append((field, old, new))
                    action, updated_at = "update", now
                else:
                    entry["record_id"] = entry.get("record_id") or _new_record_id()
                    action, updated_at = "create", None

                cur.execute(
                    _UPSERT_SQL,
                    _upsert_params(entry, saved_at=now, updated_at=updated_at),
                )
                saved = _row_to_dict(cur.fetchone())

    # Audit only after the write has committed — the log must never describe a
    # change that rolled back. append_event uses its own connection anyway.
    for field, old, new in changed:
        audit.append_event(
            saved["record_id"], "edit", user=entry.get("sme"), field=field,
            old_value=old, new_value=new,
            note="SME review — updated on re-extraction",
        )
    audit.append_event(
        saved["record_id"], action, user=entry.get("sme"),
        note="Re-stored from extraction" if action == "update" else "Stored from extraction",
    )
    return saved


def update_record(record_id: str, changes: dict, user: str | None = None,
                  note: str | None = None) -> dict:
    """Apply a partial edit, logging one audit event per changed field.

    Raises KeyError when the record is missing and ValueError for a field that
    isn't a writable column. Takes a row-level lock so two concurrent edits to
    the same record serialise instead of clobbering each other.
    """
    db.require_db()
    applied = {k: v for k, v in changes.items() if k not in _IMMUTABLE}
    unknown = sorted(k for k in applied if k not in record_columns.WRITABLE)
    if unknown:
        raise ValueError(f"Not an editable field: {', '.join(unknown)}")

    now = _now()
    changed: list[tuple] = []

    try:
        with db.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                with conn.transaction():
                    cur.execute(
                        "SELECT * FROM roi_records WHERE record_id = %s FOR UPDATE",
                        (record_id,),
                    )
                    existing = cur.fetchone()
                    if existing is None:
                        raise KeyError(record_id)

                    sets, params = [], {"record_id": record_id, "updated_at": now}
                    for field, new_value in applied.items():
                        if existing.get(field) == new_value:
                            continue
                        sets.append(f"{field} = %({field})s")
                        params[field] = _jsonb(field, new_value)
                        changed.append((field, existing.get(field), new_value))

                    if not sets:
                        return _row_to_dict(existing)

                    cur.execute(
                        f"UPDATE roi_records SET {', '.join(sets)},"
                        " updated_at = %(updated_at)s"
                        " WHERE record_id = %(record_id)s RETURNING *",
                        params,
                    )
                    updated = _row_to_dict(cur.fetchone())
    except psycopg.errors.UniqueViolation as e:
        # Most likely two records claiming one hub deliverable.
        raise Conflict(_conflict_message(e)) from e

    for field, old, new in changed:
        audit.append_event(record_id, "edit", user=user, field=field,
                           old_value=old, new_value=new, note=note)
    return updated


def patch_executive_summary(identifier: str, summary: dict) -> dict | None:
    """Attach a generated executive summary to one record.

    Matches by record_id, stored_name, or source_file — whichever hits first.
    """
    db.require_db()
    with db.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "UPDATE roi_records SET executive_summary = %(summary)s,"
                "                       updated_at = %(now)s"
                " WHERE record_id = ("
                "     SELECT record_id FROM roi_records"
                "      WHERE record_id = %(id)s OR stored_name = %(id)s"
                "         OR source_file = %(id)s"
                "      ORDER BY seq LIMIT 1)"
                " RETURNING *",
                {"summary": Jsonb(summary), "now": _now(), "id": identifier},
            )
            row = cur.fetchone()
    return _row_to_dict(row) if row else None


# ── deletes ───────────────────────────────────────────────────────────────────
def delete_record(record_id: str) -> bool:
    """Permanently remove one record. Returns False when it did not exist."""
    db.require_db()
    with db.connection() as conn:
        cur = conn.execute("DELETE FROM roi_records WHERE record_id = %s", (record_id,))
        return cur.rowcount > 0


def clear_all_records() -> int:
    """Delete every record. Returns the count removed."""
    db.require_db()
    with db.connection() as conn:
        cur = conn.execute("DELETE FROM roi_records")
        return cur.rowcount


def delete_by_batch_id(batch_id: str) -> int:
    """Delete all records tagged with batch_id. Returns the count removed."""
    db.require_db()
    with db.connection() as conn:
        cur = conn.execute("DELETE FROM roi_records WHERE batch_id = %s", (batch_id,))
        return cur.rowcount


# ── exports ───────────────────────────────────────────────────────────────────
def export_csv() -> str:
    """Return all records as a CSV string with the 15 Domo columns."""
    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["record_id"] + DOMO_COLUMNS,
        extrasaction="ignore",
        lineterminator="\n",
    )
    writer.writeheader()
    for r in get_all_records():
        writer.writerow(r)
    return output.getvalue()


def _style_header(ws, columns, header_fill, header_font):
    for col_idx, col_name in enumerate(columns, start=1):
        cell = ws.cell(row=1, column=col_idx, value=col_name)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")


def _autowidth(ws, columns):
    for col_idx, col_name in enumerate(columns, start=1):
        ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = max(
            len(str(col_name)) + 2, 12
        )


def export_xlsx() -> bytes:
    """Return all records as an XLSX workbook with four sheets:
      1. All_ROI_Data     — clean ROI values + record_id (Domo-ready)
      2. SME_Audit_Log    — the append-only event history (creates + edits)
      3. Field_Provenance — per-field source slide + confidence (long format)
      4. Field_Definitions — the field catalog: label, type, notes, and the
                             ui_visible / editable / exportable / provenance flags
    Sheets 1–3 join on record_id; sheet 4 documents what every column means.
    """
    records = get_all_records()
    by_id = {r.get("record_id"): r for r in records}
    header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True)

    wb = Workbook()

    # ─── Sheet 1: All_ROI_Data (clean) ───────────────────────────────────────
    ws_data = wb.active
    ws_data.title = "All_ROI_Data"
    data_columns = (
        ["record_id"] + DOMO_COLUMNS
        + ["applicable_from", "applicable_to", "confidence", "source_file", "sme",
           "stored_name", "saved_at"]
    )
    _style_header(ws_data, data_columns, header_fill, header_font)
    for row_idx, record in enumerate(records, start=2):
        for col_idx, col_name in enumerate(data_columns, start=1):
            ws_data.cell(row=row_idx, column=col_idx, value=record.get(col_name))
    _autowidth(ws_data, data_columns)

    # ─── Sheet 2: SME_Audit_Log (event history) ──────────────────────────────
    ws_audit = wb.create_sheet("SME_Audit_Log")
    audit_columns = [
        "timestamp", "record_id", "client", "publisher", "year",
        "user", "action", "field", "old_value", "new_value", "note",
    ]
    _style_header(ws_audit, audit_columns, header_fill, header_font)

    events = audit.get_events()
    # Legacy fallback: records that predate the event log get a synthetic
    # "create" row so the sheet still reflects them.
    logged_ids = {e.get("record_id") for e in events}
    synthetic = [
        {
            "timestamp": r.get("saved_at"), "record_id": r.get("record_id"),
            "user": r.get("sme"), "action": "create", "field": None,
            "old_value": None, "new_value": None, "note": r.get("notes"),
        }
        for r in records if r.get("record_id") not in logged_ids
    ]
    rows = sorted(events + synthetic, key=lambda e: e.get("timestamp") or "")
    for row_idx, e in enumerate(rows, start=2):
        rec = by_id.get(e.get("record_id"), {})
        ws_audit.cell(row=row_idx, column=1, value=e.get("timestamp"))
        ws_audit.cell(row=row_idx, column=2, value=e.get("record_id"))
        ws_audit.cell(row=row_idx, column=3, value=rec.get("client"))
        ws_audit.cell(row=row_idx, column=4, value=rec.get("publisher"))
        ws_audit.cell(row=row_idx, column=5, value=rec.get("year"))
        ws_audit.cell(row=row_idx, column=6, value=e.get("user"))
        ws_audit.cell(row=row_idx, column=7, value=e.get("action"))
        ws_audit.cell(row=row_idx, column=8, value=e.get("field"))
        ws_audit.cell(row=row_idx, column=9, value=e.get("old_value"))
        ws_audit.cell(row=row_idx, column=10, value=e.get("new_value"))
        ws_audit.cell(row=row_idx, column=11, value=e.get("note"))
    _autowidth(ws_audit, audit_columns)

    # ─── Sheet 3: Field_Provenance (long format) ──────────────────────────────
    ws_prov = wb.create_sheet("Field_Provenance")
    prov_columns = [
        "record_id", "client", "publisher", "year",
        "metric", "value", "source_slide", "confidence", "alternates",
    ]
    _style_header(ws_prov, prov_columns, header_fill, header_font)
    prov_row = 2
    for record in records:
        fmeta = record.get("field_meta") or {}
        for key, label in PROVENANCE_METRICS:
            meta = fmeta.get(key)
            # Emit a row when there's a value or any provenance for this metric.
            if record.get(key) is None and not meta:
                continue
            meta = meta or {}
            alts = meta.get("alternates") or []
            alts_str = "; ".join(
                f"{a.get('value')} ({a.get('confidence')}%)" for a in alts
            ) if alts else None
            ws_prov.cell(row=prov_row, column=1, value=record.get("record_id"))
            ws_prov.cell(row=prov_row, column=2, value=record.get("client"))
            ws_prov.cell(row=prov_row, column=3, value=record.get("publisher"))
            ws_prov.cell(row=prov_row, column=4, value=record.get("year"))
            ws_prov.cell(row=prov_row, column=5, value=label)
            ws_prov.cell(row=prov_row, column=6, value=record.get(key))
            ws_prov.cell(row=prov_row, column=7, value=meta.get("source_slide"))
            ws_prov.cell(row=prov_row, column=8, value=meta.get("confidence"))
            ws_prov.cell(row=prov_row, column=9, value=alts_str)
            prov_row += 1
    _autowidth(ws_prov, prov_columns)

    # ─── Sheet 4: Field_Definitions (the catalog) ─────────────────────────────
    # Documents every column: label, type, notes, and which fields are hidden in
    # the UI / editable / exported / provenance-bearing. Driven entirely by
    # models/field_catalog.py so the docs can never drift from the app.
    ws_fields = wb.create_sheet("Field_Definitions")
    field_columns = [
        "field", "label", "type", "ui_visible", "editable",
        "exportable", "provenance", "notes",
    ]
    _style_header(ws_fields, field_columns, header_fill, header_font)
    for row_idx, f in enumerate(FIELD_CATALOG, start=2):
        ws_fields.cell(row=row_idx, column=1, value=f.key)
        ws_fields.cell(row=row_idx, column=2, value=f.label)
        ws_fields.cell(row=row_idx, column=3, value=f.type)
        ws_fields.cell(row=row_idx, column=4, value="yes" if f.ui_visible else "no")
        ws_fields.cell(row=row_idx, column=5, value="yes" if f.editable else "no")
        ws_fields.cell(row=row_idx, column=6, value="yes" if f.exportable else "no")
        ws_fields.cell(row=row_idx, column=7, value="yes" if f.provenance else "no")
        ws_fields.cell(row=row_idx, column=8, value=f.notes)
    _autowidth(ws_fields, field_columns)
    # Give the notes column real room — autowidth caps at the (short) header.
    ws_fields.column_dimensions[ws_fields.cell(row=1, column=8).column_letter].width = 70

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output.getvalue()
