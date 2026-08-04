"""
Which publishers a delivery-hub workstream may report ROI for.

The hub owns *workstreams* (its teams) and hands one over on the deep link. ROI
is reported per *publisher*, and a workstream is usually — though not always —
tied to one. This module is the allow-list the wizard offers, so the SME picks a
real publisher rather than free-typing a value that won't group in the
dashboards.

Mappings are one-to-one today. `is_default` exists so a workstream can gain a
second publisher later without a schema change: the default is preselected and
the rest become alternatives.

When a workstream has no mapping the caller gets `mapped: False` plus every
publisher already present in the records, so the UI can offer a sensible choice
instead of an empty dropdown.
"""
import logging

from psycopg.rows import dict_row

from services import db

log = logging.getLogger("roi.workstreams")


def known_publishers() -> list[str]:
    """Every publisher that appears on an existing record, alphabetically."""
    db.require_db()
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT DISTINCT publisher FROM roi_records"
            " WHERE publisher IS NOT NULL AND publisher <> ''"
            " ORDER BY publisher"
        ).fetchall()
    return [r[0] for r in rows]


def publishers_for(workstream: str) -> dict:
    """Allowed publishers for one workstream.

    Returns {workstream, mapped, publishers: [{publisher, is_default}]}.
    `mapped` is False when no explicit mapping exists, in which case
    `publishers` falls back to every publisher already in use.
    """
    name = (workstream or "").strip()
    if not name:
        return {
            "workstream": "",
            "mapped": False,
            "publishers": [{"publisher": p, "is_default": False} for p in known_publishers()],
        }

    db.require_db()
    with db.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT publisher, is_default FROM workstream_publishers"
                " WHERE lower(workstream) = lower(%s)"
                " ORDER BY is_default DESC, publisher",
                (name,),
            )
            rows = [dict(r) for r in cur.fetchall()]

    if rows:
        return {"workstream": name, "mapped": True, "publishers": rows}

    return {
        "workstream": name,
        "mapped": False,
        "publishers": [{"publisher": p, "is_default": False} for p in known_publishers()],
    }


def all_mappings() -> list[dict]:
    """Every mapping, grouped by workstream."""
    db.require_db()
    with db.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT workstream, publisher, is_default FROM workstream_publishers"
                " ORDER BY workstream, is_default DESC, publisher"
            )
            rows = [dict(r) for r in cur.fetchall()]

    grouped: dict[str, dict] = {}
    for r in rows:
        entry = grouped.setdefault(r["workstream"], {"workstream": r["workstream"], "publishers": []})
        entry["publishers"].append({"publisher": r["publisher"], "is_default": r["is_default"]})
    return list(grouped.values())


def set_mapping(workstream: str, publishers: list[str], default: str | None = None) -> dict:
    """Replace the mapping for one workstream.

    Passing an empty publisher list clears it, which returns the workstream to
    the unmapped fallback rather than leaving it with no valid choice.
    """
    name = (workstream or "").strip()
    if not name:
        raise ValueError("workstream is required")

    cleaned = [p.strip() for p in publishers if p and p.strip()]
    # De-duplicate case-insensitively while keeping the caller's order.
    seen: set[str] = set()
    unique: list[str] = []
    for p in cleaned:
        if p.lower() not in seen:
            seen.add(p.lower())
            unique.append(p)

    # Default to the first entry so a mapped workstream always has something
    # preselected; an explicit default must be one of the listed publishers.
    chosen = (default or "").strip()
    if chosen and chosen.lower() not in seen:
        raise ValueError(f"default '{chosen}' is not in the publisher list")
    if not chosen and unique:
        chosen = unique[0]

    db.require_db()
    with db.connection() as conn:
        with conn.transaction():
            conn.execute(
                "DELETE FROM workstream_publishers WHERE lower(workstream) = lower(%s)",
                (name,),
            )
            for p in unique:
                conn.execute(
                    "INSERT INTO workstream_publishers (workstream, publisher, is_default)"
                    " VALUES (%s, %s, %s)",
                    (name, p, p.lower() == chosen.lower()),
                )
    return publishers_for(name)


def seed_identity_mappings(conn) -> int:
    """Seed 1-1 mappings from the publishers already in the records.

    A workstream named after a publisher — which is the common case, since the
    hub's teams are publisher practices — then resolves to that publisher with
    no manual setup. Existing mappings are never overwritten.
    """
    inserted = conn.execute(
        "INSERT INTO workstream_publishers (workstream, publisher, is_default)"
        " SELECT DISTINCT publisher, publisher, true FROM roi_records"
        "  WHERE publisher IS NOT NULL AND publisher <> ''"
        " ON CONFLICT (workstream, publisher) DO NOTHING"
    ).rowcount
    return max(inserted, 0)
