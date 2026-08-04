"""
Saved dashboard views.

These used to live in browser localStorage under `domosapiens.dashboards`, which
made them per-browser: a dashboard one SME saved was invisible to everyone else,
gone when the cache was cleared, and absent on their other machine. On a
multi-user Alfred deployment that is a data-loss bug wearing a feature's clothes.

A dashboard is an opaque config object owned by the frontend. Only `id`, `name`
and the owner are promoted to columns — everything else round-trips through
`config` untouched, so the UI can evolve its shape without a migration here.
"""
import logging
import uuid
from datetime import datetime, timezone

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from services import db

log = logging.getLogger("roi.dashboards")

_RESERVED = {"id", "name", "owner", "owner_email", "created_at", "updated_at"}


def _new_id() -> str:
    return f"d_{uuid.uuid4().hex[:12]}"


def _row_to_dashboard(row) -> dict:
    """Rebuild the object the frontend saved, with server fields layered on."""
    config = row.get("config") or {}
    out = dict(config)
    out["id"] = row["id"]
    out["name"] = row["name"]
    out["owner"] = row.get("owner")
    out["owner_email"] = row.get("owner_email")
    for key in ("created_at", "updated_at"):
        value = row.get(key)
        out[key] = value.isoformat() if hasattr(value, "isoformat") else value
    return out


def list_dashboards() -> list[dict]:
    """Every saved dashboard, newest first."""
    db.require_db()
    with db.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT id, name, owner, owner_email, config, created_at, updated_at"
                " FROM dashboards ORDER BY created_at DESC"
            )
            return [_row_to_dashboard(r) for r in cur.fetchall()]


def upsert_dashboard(dash: dict, owner: dict | None = None) -> dict:
    """Create or replace one dashboard. Returns the stored form.

    The owner is taken from the caller's SSO identity, never from the payload —
    a client must not be able to attribute a dashboard to someone else.
    """
    db.require_db()
    dash_id = str(dash.get("id") or "").strip() or _new_id()
    name = str(dash.get("name") or "").strip() or "Untitled dashboard"
    config = {k: v for k, v in dash.items() if k not in _RESERVED}
    now = datetime.now(timezone.utc)

    with db.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "INSERT INTO dashboards (id, name, owner, owner_email, config,"
                "                        created_at, updated_at)"
                " VALUES (%(id)s, %(name)s, %(owner)s, %(email)s, %(config)s,"
                "         %(now)s, %(now)s)"
                " ON CONFLICT (id) DO UPDATE SET"
                "   name = EXCLUDED.name,"
                "   config = EXCLUDED.config,"
                "   updated_at = EXCLUDED.updated_at"
                " RETURNING id, name, owner, owner_email, config, created_at, updated_at",
                {
                    "id": dash_id,
                    "name": name,
                    "owner": (owner or {}).get("username") or None,
                    "email": (owner or {}).get("email") or None,
                    "config": Jsonb(config),
                    "now": now,
                },
            )
            return _row_to_dashboard(cur.fetchone())


def delete_dashboard(dash_id: str) -> bool:
    """Remove one dashboard. Returns False when it did not exist."""
    db.require_db()
    with db.connection() as conn:
        cur = conn.execute("DELETE FROM dashboards WHERE id = %s", (dash_id,))
        return cur.rowcount > 0


def import_many(items: list[dict], owner: dict | None = None) -> int:
    """Adopt dashboards that only ever existed in one browser's localStorage.

    Existing ids are left alone, so running this twice cannot overwrite a
    dashboard that has since been edited server-side.
    """
    db.require_db()
    now = datetime.now(timezone.utc)
    inserted = 0
    with db.connection() as conn:
        with conn.transaction():
            for dash in items:
                if not isinstance(dash, dict) or dash.get("seed"):
                    continue  # built-in templates are not user data
                dash_id = str(dash.get("id") or "").strip() or _new_id()
                config = {k: v for k, v in dash.items() if k not in _RESERVED}
                cur = conn.execute(
                    "INSERT INTO dashboards (id, name, owner, owner_email, config,"
                    "                        created_at, updated_at)"
                    " VALUES (%s, %s, %s, %s, %s, %s, %s)"
                    " ON CONFLICT (id) DO NOTHING",
                    (
                        dash_id,
                        str(dash.get("name") or "").strip() or "Untitled dashboard",
                        (owner or {}).get("username") or None,
                        (owner or {}).get("email") or None,
                        Jsonb(config),
                        now,
                        now,
                    ),
                )
                inserted += cur.rowcount
    if inserted:
        log.info("Adopted %d dashboard(s) from browser storage", inserted)
    return inserted
