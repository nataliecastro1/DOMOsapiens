"""
Postgres access for file metadata.

One tiny table (`files`) records every upload: the content-hash file ID,
original filename, and where the bytes live in the file store. The same
code runs locally (local Postgres, DATABASE_URL in backend/.env) and on
Alfred (DATABASE_URL injected as a service secret).

The app degrades gracefully if Postgres is unreachable: uploads still land
in the file store, and listing falls back to the store itself. A warning is
logged loudly on startup so a misconfigured deploy is visible immediately.
"""
import logging
import os
from contextlib import contextmanager

import psycopg
from dotenv import load_dotenv

load_dotenv()  # env is read at import time — don't depend on config.py's import order

log = logging.getLogger("roi.db")

DATABASE_URL = os.getenv("DATABASE_URL", "")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS files (
    id              TEXT PRIMARY KEY,          -- md5 of content (stable dedup id)
    filename        TEXT NOT NULL,             -- original client filename
    stored_name     TEXT NOT NULL UNIQUE,      -- <id><ext>, key stem in the store
    storage_key     TEXT NOT NULL,             -- full key in the file store
    storage_backend TEXT NOT NULL,             -- 'local' | 's3'
    content_type    TEXT,
    size_bytes      BIGINT,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Attribution comes from Alfred's SSO headers, never the request body.
ALTER TABLE files ADD COLUMN IF NOT EXISTS uploaded_by       TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS uploaded_by_email TEXT;
"""

_available = False


@contextmanager
def _conn():
    with psycopg.connect(DATABASE_URL, connect_timeout=5) as conn:
        yield conn


def init_db() -> bool:
    """Create the schema. Returns True when Postgres is usable."""
    global _available
    if not DATABASE_URL:
        log.warning("DATABASE_URL not set — file metadata will NOT be stored in Postgres")
        _available = False
        return False
    try:
        with _conn() as conn:
            conn.execute(_SCHEMA)
        _available = True
        log.info("Postgres connected, files table ready")
    except Exception as e:
        _available = False
        log.warning("Postgres unavailable (%s) — file metadata will NOT be stored", e)
    return _available


def db_available() -> bool:
    return _available


def upsert_file(meta: dict) -> None:
    """Record an upload. Idempotent — same content hash overwrites in place."""
    with _conn() as conn:
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
    with _conn() as conn:
        row = conn.execute(
            """
            SELECT id, filename, stored_name, storage_key, storage_backend,
                   content_type, size_bytes, uploaded_at,
                   uploaded_by, uploaded_by_email
            FROM files
            WHERE id = %(v)s OR stored_name = %(v)s
            """,
            {"v": file_id_or_stored_name},
        ).fetchone()
    return _row_to_dict(row)


def find_by_id_prefix(prefix: str) -> dict | None:
    with _conn() as conn:
        row = conn.execute(
            "SELECT id, filename, stored_name, storage_key, storage_backend,"
            "       content_type, size_bytes, uploaded_at,"
            "       uploaded_by, uploaded_by_email"
            " FROM files WHERE id LIKE %s ORDER BY uploaded_at DESC LIMIT 1",
            (prefix + "%",),
        ).fetchone()
    return _row_to_dict(row)


def list_files() -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT id, filename, stored_name, storage_key, storage_backend,"
            "       content_type, size_bytes, uploaded_at,"
            "       uploaded_by, uploaded_by_email"
            " FROM files ORDER BY uploaded_at DESC"
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def delete_file(stored_name: str) -> bool:
    with _conn() as conn:
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
