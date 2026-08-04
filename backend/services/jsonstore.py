"""
Durable JSON-document collections.

Holds `audit_events` — an append-only history where each row is genuinely a
document and there is nothing to query relationally. ROI records used to live
here too but have graduated to their own typed table (see services/storage.py);
they were tabular data in a document bag, which forced a full rewrite of every
row on every single save.

This module keeps the exact `list[dict]` semantics those services expect while
storing each document as a JSONB row in Postgres. Ordering is preserved via a
monotonic sequence, so append-only histories stay chronological.

Locally (or with DATABASE_URL unset) operations fall back to the original JSON
file, so dev without a database keeps working. On first successful connect an
existing JSON file is imported once so no local data is lost.

Deployed, that fallback is DISABLED on purpose: a container-local file would be
silently discarded on the next redeploy, so a save could appear to succeed and
then vanish. Failing loudly is the safer failure mode.
"""
import json
import logging
import os
import threading

from services import db
from services.identity import IS_DEPLOYED

log = logging.getLogger("roi.jsonstore")

class Collection:
    """A named list of JSON documents, durable in Postgres when available.

    `id_key` is the field holding each document's stable identity (e.g.
    "event_id"). Documents without one get a synthetic positional id.

    The table itself is created by services.schema at startup, not lazily here,
    so a missing GRANT fails the deploy rather than the first user save.
    """

    def __init__(self, name: str, file_path: str, id_key: str):
        self.name = name
        self.file_path = os.path.abspath(file_path)
        self.id_key = id_key
        self._migrated = False
        self._lock = threading.Lock()

    # ── file fallback ────────────────────────────────────────────────────
    def _no_fallback(self, op: str):
        """Deployed, there is no safe local fallback — surface the failure."""
        raise RuntimeError(
            f"Cannot {op} '{self.name}': Postgres is unavailable and this is a "
            "deployed instance, where a local file would be lost on redeploy. "
            "Check DATABASE_URL and the managed database."
        )

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
            with db.connection() as conn:
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
        with db.connection() as conn:
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
        with db.connection() as conn:
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
        with db.connection() as conn:
            conn.execute(
                "INSERT INTO json_documents (collection, doc_id, data)"
                " VALUES (%s, %s, %s)"
                " ON CONFLICT (collection, doc_id) DO UPDATE SET"
                "   data = EXCLUDED.data, updated_at = now()",
                (self.name, self._doc_id(item, 0), json.dumps(item, default=str)),
            )

    # ── public API (mirrors the old _load/_save pair) ─────────────────────
    def load(self) -> list[dict]:
        if db.db_available():
            try:
                self._import_file_once()
                return self._pg_load()
            except Exception as e:
                log.warning("%s: Postgres read failed: %s", self.name, e)
                if IS_DEPLOYED:
                    raise
        elif IS_DEPLOYED:
            self._no_fallback("read")
        return self._file_load()

    def save(self, items: list[dict]) -> None:
        if db.db_available():
            try:
                self._import_file_once()
                self._pg_replace(items)
                return
            except Exception as e:
                log.error("%s: Postgres write failed: %s", self.name, e)
                if IS_DEPLOYED:
                    raise
        elif IS_DEPLOYED:
            self._no_fallback("write")
        self._file_save(items)

    def append(self, item: dict) -> None:
        """Add one document without rewriting the collection."""
        if db.db_available():
            try:
                self._import_file_once()
                self._pg_append(item)
                return
            except Exception as e:
                log.error("%s: Postgres append failed: %s", self.name, e)
                if IS_DEPLOYED:
                    raise
        elif IS_DEPLOYED:
            self._no_fallback("append to")
        with self._lock:
            items = self._file_load()
            items.append(item)
            self._file_save(items)
