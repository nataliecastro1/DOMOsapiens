"""
Durable JSON-document collections.

The app's data (ROI records, audit events, client roster) started life as
`list[dict]` written to JSON files under backend/data/. That works locally but
not on Alfred, where the container filesystem is recreated on every redeploy —
records saved through the UI would silently vanish.

This module keeps the exact `list[dict]` semantics those services expect while
storing each document as a JSONB row in Postgres. Ordering is preserved via a
monotonic sequence, so append-only histories stay chronological.

If Postgres is unreachable (or DATABASE_URL is unset), every operation falls
back to the original JSON file, so local dev without a database keeps working
unchanged. On first successful connect, an existing JSON file is imported once
so no local data is lost.
"""
import json
import logging
import os
import threading

from services import db

log = logging.getLogger("roi.jsonstore")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS json_documents (
    collection  TEXT   NOT NULL,
    doc_id      TEXT   NOT NULL,
    seq         BIGSERIAL,
    data        JSONB  NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (collection, doc_id)
);
CREATE INDEX IF NOT EXISTS json_documents_collection_seq
    ON json_documents (collection, seq);
"""

_schema_ready = False
_schema_lock = threading.Lock()


def _ensure_schema() -> bool:
    """Create the table once per process. Returns True when Postgres is usable."""
    global _schema_ready
    if _schema_ready:
        return True
    if not db.db_available():
        return False
    with _schema_lock:
        if _schema_ready:
            return True
        try:
            with db._conn() as conn:
                conn.execute(_SCHEMA)
            _schema_ready = True
        except Exception as e:
            log.warning("Could not create json_documents table: %s", e)
            return False
    return _schema_ready


class Collection:
    """A named list of JSON documents, durable in Postgres when available.

    `id_key` is the field holding each document's stable identity (e.g.
    "record_id"). Documents without one get a synthetic positional id, which
    keeps ad-hoc lists (like the client roster) working.
    """

    def __init__(self, name: str, file_path: str, id_key: str):
        self.name = name
        self.file_path = os.path.abspath(file_path)
        self.id_key = id_key
        self._migrated = False
        self._lock = threading.Lock()

    # ── file fallback ────────────────────────────────────────────────────
    def _file_load(self) -> list[dict]:
        if not os.path.exists(self.file_path):
            return []
        try:
            with open(self.file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data if isinstance(data, list) else []
        except (json.JSONDecodeError, OSError):
            return []

    def _file_save(self, items: list[dict]) -> None:
        os.makedirs(os.path.dirname(self.file_path), exist_ok=True)
        tmp = self.file_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(items, f, indent=2, default=str)
        os.replace(tmp, self.file_path)  # atomic — no partial writes

    # ── helpers ──────────────────────────────────────────────────────────
    def _doc_id(self, item: dict, index: int) -> str:
        value = item.get(self.id_key)
        return str(value) if value not in (None, "") else f"_pos_{index}"

    def _import_file_once(self) -> None:
        """Seed Postgres from the legacy JSON file the first time we connect."""
        if self._migrated:
            return
        self._migrated = True
        try:
            with db._conn() as conn:
                row = conn.execute(
                    "SELECT COUNT(*) FROM json_documents WHERE collection = %s",
                    (self.name,),
                ).fetchone()
                if row and row[0]:
                    return  # already populated
            legacy = self._file_load()
            if legacy:
                self._pg_replace(legacy)
                log.info("Imported %d legacy %s documents into Postgres",
                         len(legacy), self.name)
        except Exception as e:
            log.warning("Legacy import for %s skipped: %s", self.name, e)

    # ── postgres ─────────────────────────────────────────────────────────
    def _pg_load(self) -> list[dict]:
        with db._conn() as conn:
            rows = conn.execute(
                "SELECT data FROM json_documents WHERE collection = %s ORDER BY seq",
                (self.name,),
            ).fetchall()
        return [r[0] for r in rows]

    def _pg_replace(self, items: list[dict]) -> None:
        """Replace the whole collection in one transaction.

        Rewrites rather than diffs, matching the previous whole-file save. The
        seq column is reassigned so list order is exactly what the caller passed.
        """
        with db._conn() as conn:
            with conn.transaction():
                conn.execute("DELETE FROM json_documents WHERE collection = %s",
                             (self.name,))
                for i, item in enumerate(items):
                    conn.execute(
                        "INSERT INTO json_documents (collection, doc_id, data)"
                        " VALUES (%s, %s, %s)",
                        (self.name, self._doc_id(item, i), json.dumps(item, default=str)),
                    )

    def _pg_append(self, item: dict) -> None:
        with db._conn() as conn:
            conn.execute(
                "INSERT INTO json_documents (collection, doc_id, data)"
                " VALUES (%s, %s, %s)"
                " ON CONFLICT (collection, doc_id) DO UPDATE SET"
                "   data = EXCLUDED.data, updated_at = now()",
                (self.name, self._doc_id(item, 0), json.dumps(item, default=str)),
            )

    # ── public API (mirrors the old _load/_save pair) ─────────────────────
    def load(self) -> list[dict]:
        if _ensure_schema():
            try:
                self._import_file_once()
                return self._pg_load()
            except Exception as e:
                log.warning("%s: Postgres read failed, using file: %s", self.name, e)
        return self._file_load()

    def save(self, items: list[dict]) -> None:
        if _ensure_schema():
            try:
                self._import_file_once()
                self._pg_replace(items)
                return
            except Exception as e:
                log.warning("%s: Postgres write failed, using file: %s", self.name, e)
        self._file_save(items)

    def append(self, item: dict) -> None:
        """Add one document without rewriting the collection."""
        if _ensure_schema():
            try:
                self._import_file_once()
                self._pg_append(item)
                return
            except Exception as e:
                log.warning("%s: Postgres append failed, using file: %s", self.name, e)
        with self._lock:
            items = self._file_load()
            items.append(item)
            self._file_save(items)
