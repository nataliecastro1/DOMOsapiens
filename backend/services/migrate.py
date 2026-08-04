"""
One-time backfills, run from `db.init_db()` at startup.

Each migration is guarded so it does nothing once it has succeeded, which makes
it safe to run on every boot and on every Alfred redeploy.

Currently one migration: lift ROI records out of the generic `json_documents`
bag (and, failing that, the legacy JSON file) into the typed `roi_records`
table. Records were tabular data living in a document store, which forced a
rewrite of every row on every save; see services/storage.py.
"""
import json
import logging
import os

from psycopg.types.json import Jsonb

from services import db, record_columns

log = logging.getLogger("roi.migrate")

LEGACY_RECORDS_FILE = os.path.join(
    os.path.dirname(__file__), "..", "data", "roi_records.json"
)


# ── value coercion ────────────────────────────────────────────────────────────
def _as_int(value):
    if value is None or value == "":
        return None
    try:
        return int(float(str(value).replace(",", "")))
    except (TypeError, ValueError):
        return None


def _as_float(value):
    if value is None or value == "":
        return None
    try:
        return float(str(value).replace(",", "").replace("$", ""))
    except (TypeError, ValueError):
        return None


def _as_bool(value):
    if isinstance(value, bool):
        return value
    if value is None or value == "":
        return None
    return str(value).strip().lower() in ("true", "yes", "1", "y")


def coerce(doc: dict) -> dict | None:
    """Map a document onto roi_records columns, typing each value.

    Returns None when the record cannot be represented (no parseable year), so
    the caller can report it rather than silently dropping it. Keys that are not
    columns — retired ones like `hub_scope_id`, or anything else historical —
    are not carried across, because only listed columns are read.
    """
    out: dict = {"record_id": doc.get("record_id")}

    for col in record_columns.SCALAR:
        value = doc.get(col)
        if col in record_columns.INT_COLUMNS:
            value = _as_int(value)
        elif col in record_columns.FLOAT_COLUMNS:
            value = _as_float(value)
        elif col in record_columns.BOOL_COLUMNS:
            value = _as_bool(value)
        elif isinstance(value, str):
            value = value.strip() or None
        out[col] = value

    if out["year"] is None:
        return None

    # NOT NULL columns need a concrete value; blanks become the documented default.
    for col, default in record_columns.NOT_NULL_TEXT_DEFAULTS.items():
        if not out.get(col):
            out[col] = default

    for col in record_columns.JSON:
        value = doc.get(col)
        out[col] = Jsonb(value) if value not in (None, "", {}, []) else None

    out["saved_at"] = doc.get("saved_at") or None
    out["updated_at"] = doc.get("updated_at") or None
    return out


# ── the migration ─────────────────────────────────────────────────────────────
def _legacy_from_json_documents(conn) -> list[dict]:
    rows = conn.execute(
        "SELECT data FROM json_documents WHERE collection = 'roi_records' ORDER BY seq"
    ).fetchall()
    return [r[0] for r in rows]


def _legacy_from_file() -> list[dict]:
    path = os.path.abspath(LEGACY_RECORDS_FILE)
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError) as e:
        log.warning("Could not read legacy records file %s: %s", path, e)
        return []


def backfill_roi_records(conn) -> int:
    """Copy legacy ROI documents into `roi_records`. No-op once populated.

    The source rows are left in place: they cost nothing, and keeping them until
    the new table has been exercised in production means this is reversible.
    """
    existing = conn.execute("SELECT count(*) FROM roi_records").fetchone()[0]
    if existing:
        return 0

    legacy = _legacy_from_json_documents(conn)
    source = "json_documents"
    if not legacy:
        legacy = _legacy_from_file()
        source = "legacy JSON file"
    if not legacy:
        return 0

    columns = ["record_id"] + record_columns.WRITABLE + ["saved_at", "updated_at"]
    placeholders = ", ".join(f"%({c})s" for c in columns)
    insert = (
        f"INSERT INTO roi_records ({', '.join(columns)}) VALUES ({placeholders})"
        " ON CONFLICT (record_id) DO NOTHING"
    )

    inserted = 0
    skipped: list[str] = []
    with conn.transaction():
        for doc in legacy:
            row = coerce(doc)
            if row is None or not row["record_id"]:
                skipped.append(str(doc.get("record_id") or "<no record_id>"))
                continue
            conn.execute(insert, row)
            inserted += 1

    log.info("Backfilled %d ROI records from %s", inserted, source)
    if skipped:
        log.warning(
            "Skipped %d record(s) with no parseable year or no record_id: %s",
            len(skipped), ", ".join(skipped[:10]),
        )
    return inserted


def run_all() -> None:
    """Apply every pending migration. Safe to call on every startup."""
    try:
        with db.connection() as conn:
            backfill_roi_records(conn)
            # Imported here to keep the import graph one-directional.
            from services import workstreams

            seeded = workstreams.seed_identity_mappings(conn)
            if seeded:
                log.info("Seeded %d identity workstream to publisher mappings", seeded)
    except Exception as e:
        # A failed migration must not stop the app from booting, but it has to be
        # loud: the Tracker would look empty and that needs to be diagnosable.
        log.error("Migration failed: %s", e)
