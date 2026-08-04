"""
Postgres connection and availability.

The same code runs locally (local Postgres, DATABASE_URL in backend/.env) and on
Alfred (DATABASE_URL injected automatically by the platform).

Availability is *re-probed*, not latched. An earlier version set a module-level
flag once during startup and never revisited it, so if Postgres happened to be
unreachable at the moment the container booted, that flag stayed False for the
life of the process — and because the deployed code correctly refuses to fall
back to a container-local file, every subsequent save raised until somebody
redeployed. A momentary blip became a hard outage. Now a failed check is retried
after a short cooldown, and a query failure marks the connection stale so the
next caller re-probes.
"""
import logging
import os
import threading
import time
from contextlib import contextmanager

import psycopg
from dotenv import load_dotenv

from services import schema

load_dotenv()  # env is read at import time — don't depend on config.py's import order

log = logging.getLogger("roi.db")

DATABASE_URL = os.getenv("DATABASE_URL", "")

# How long to wait before retrying after a failed probe. Short enough that a
# brief outage self-heals within a request or two, long enough that a genuinely
# down database isn't hammered on every call.
PROBE_COOLDOWN_SECONDS = 5.0

_state = {"available": False, "probed_at": 0.0}
_probe_lock = threading.Lock()


@contextmanager
def _raw_conn():
    with psycopg.connect(DATABASE_URL, connect_timeout=5) as conn:
        yield conn


@contextmanager
def connection():
    """A Postgres connection that marks the pool stale on a *connection* failure.

    Use this for all real work: a network error or a dropped server flips
    availability off so the next `db_available()` re-probes rather than
    continuing to assume a healthy database.

    Only OperationalError and InterfaceError count. Application-level errors —
    a unique violation, a bad column name — mean the database is working
    perfectly and answered us; treating those as an outage would take the whole
    app offline every time a constraint did its job.
    """
    try:
        with _raw_conn() as conn:
            yield conn
    except (psycopg.OperationalError, psycopg.InterfaceError):
        mark_unavailable()
        raise


# Kept for the existing jsonstore call sites.
_conn = connection


def _probe() -> bool:
    """Connect and ensure the schema. Returns True when Postgres is usable."""
    try:
        with _raw_conn() as conn:
            schema.apply(conn)
        if not _state["available"]:
            log.info("Postgres connected; all tables ready")
        _state["available"] = True
        return True
    except Exception as e:
        _state["available"] = False
        log.warning("Postgres unavailable: %s", e)
        return False


def init_db() -> bool:
    """Create every table at startup. Returns True when Postgres is usable.

    A False return is not fatal on a developer machine, but on Alfred it means
    records cannot be saved — services.jsonstore and services.storage both
    refuse to write to a container-local file that a redeploy would discard.
    """
    if not DATABASE_URL:
        log.warning("DATABASE_URL not set — Postgres-backed storage is DISABLED")
        _state["available"] = False
        return False
    with _probe_lock:
        _state["probed_at"] = time.monotonic()
        ok = _probe()
    if ok:
        # Imported here rather than at module scope: migrate depends on db.
        from services import migrate

        migrate.run_all()
    return ok


def db_available() -> bool:
    """Whether Postgres is usable right now, re-probing after a cooldown."""
    if not DATABASE_URL:
        return False
    if _state["available"]:
        return True
    now = time.monotonic()
    if now - _state["probed_at"] < PROBE_COOLDOWN_SECONDS:
        return False
    with _probe_lock:
        # Another thread may have recovered it while we waited for the lock.
        if _state["available"]:
            return True
        if time.monotonic() - _state["probed_at"] < PROBE_COOLDOWN_SECONDS:
            return False
        _state["probed_at"] = time.monotonic()
        return _probe()


def mark_unavailable() -> None:
    """Flag the connection stale so the next `db_available()` re-probes."""
    _state["available"] = False


def require_db() -> None:
    """Raise unless Postgres is usable. For paths with no safe fallback."""
    if not db_available():
        raise RuntimeError(
            "Postgres is unavailable. Records cannot be read or written without "
            "it; a container-local file would be discarded on the next redeploy. "
            "Check DATABASE_URL and the managed database."
        )


# ── files table ───────────────────────────────────────────────────────────────
_FILE_COLUMNS = (
    "id, filename, stored_name, storage_key, storage_backend, "
    "content_type, size_bytes, uploaded_at, uploaded_by, uploaded_by_email"
)


def upsert_file(meta: dict) -> None:
    """Record an upload. Idempotent — same content hash overwrites in place."""
    with connection() as conn:
        conn.execute(
            """
            INSERT INTO files (id, filename, stored_name, storage_key,
                               storage_backend, content_type, size_bytes,
                               uploaded_by, uploaded_by_email)
            VALUES (%(id)s, %(filename)s, %(stored_name)s, %(storage_key)s,
                    %(storage_backend)s, %(content_type)s, %(size)s,
                    %(uploaded_by)s, %(uploaded_by_email)s)
            ON CONFLICT (id) DO UPDATE SET
                filename = EXCLUDED.filename,
                storage_key = EXCLUDED.storage_key,
                storage_backend = EXCLUDED.storage_backend,
                -- keep the first uploader on a dedup hit; only fill if unknown
                uploaded_by = COALESCE(files.uploaded_by, EXCLUDED.uploaded_by),
                uploaded_by_email = COALESCE(files.uploaded_by_email, EXCLUDED.uploaded_by_email)
            """,
            meta,
        )


def get_file(file_id_or_stored_name: str) -> dict | None:
    with connection() as conn:
        row = conn.execute(
            f"SELECT {_FILE_COLUMNS} FROM files WHERE id = %(v)s OR stored_name = %(v)s",
            {"v": file_id_or_stored_name},
        ).fetchone()
    return _row_to_dict(row)


def find_by_id_prefix(prefix: str) -> dict | None:
    with connection() as conn:
        row = conn.execute(
            f"SELECT {_FILE_COLUMNS} FROM files WHERE id LIKE %s"
            " ORDER BY uploaded_at DESC LIMIT 1",
            (prefix + "%",),
        ).fetchone()
    return _row_to_dict(row)


def list_files() -> list[dict]:
    with connection() as conn:
        rows = conn.execute(
            f"SELECT {_FILE_COLUMNS} FROM files ORDER BY uploaded_at DESC"
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def delete_file(stored_name: str) -> bool:
    with connection() as conn:
        cur = conn.execute("DELETE FROM files WHERE stored_name = %s", (stored_name,))
        return cur.rowcount > 0


def _row_to_dict(row) -> dict | None:
    if row is None:
        return None
    return {
        "id": row[0],
        "filename": row[1],
        "stored_name": row[2],
        "storage_key": row[3],
        "storage_backend": row[4],
        "content_type": row[5],
        "size": row[6],
        "uploaded_at": row[7].isoformat() if row[7] else None,
        "uploaded_by": row[8],
        "uploaded_by_email": row[9],
    }
