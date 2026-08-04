"""
Uploaded source documents (PPTX / PDF / XLSX).

Storage architecture (works the same locally and on Alfred):
  1. Durable copy   → the file store (S3 on Alfred, a local folder mimicking
                      S3 in dev — see services/filestore.py).
  2. Metadata + ID  → Postgres `files` table (see services/db.py). The file
                      ID is the MD5 of the content, so identical uploads
                      dedupe to one object and one row.
  3. Render cache   → backend/data/uploads/ on local disk. Thumbnails, slide
                      rendering, and PPTX→PDF conversion need a real path, so
                      files are materialised here on demand from the store.
                      The cache is disposable — it is rebuilt lazily, which is
                      what makes redeploys on Alfred safe.

`local_path()` is the only way route code should turn a stored_name into a
filesystem path.
"""
import hashlib
import logging
import os
from datetime import datetime, timezone

from services import db
from services.filestore import store

log = logging.getLogger("roi.uploads")

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "uploads")
STORE_PREFIX = "uploads"

# Extensions the Upload card in the Extraction view advertises.
ALLOWED_EXTENSIONS = {".pptx", ".ppt", ".pdf", ".xlsx"}
MAX_BYTES = 50 * 1024 * 1024  # 50 MB


class UploadError(Exception):
    """Raised when an uploaded file is rejected (bad type, too large, empty)."""


def _ext(filename: str) -> str:
    return os.path.splitext(filename or "")[1].lower()


def _store_key(stored_name: str) -> str:
    return f"{STORE_PREFIX}/{stored_name}"


def validate(filename: str) -> str:
    """Return the lower-cased extension, or raise UploadError if unsupported."""
    ext = _ext(filename)
    if ext not in ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise UploadError(
            f"Unsupported file type '{ext or 'unknown'}'. Allowed: {allowed}."
        )
    return ext


def save_upload(filename: str, content: bytes, uploaded_by: dict | None = None) -> dict:
    """Persist an uploaded file: durable copy in the file store, metadata row
    in Postgres, and a warm copy in the local render cache. Dedupes by content
    hash — identical bytes yield the same file ID and a single stored object.

    `uploaded_by` is the SSO identity from services.identity.current_user() —
    resolved from Alfred's headers by the route, never from the request body.
    """
    ext = validate(filename)
    if not content:
        raise UploadError("Uploaded file is empty.")
    if len(content) > MAX_BYTES:
        raise UploadError(f"File exceeds the {MAX_BYTES // (1024 * 1024)} MB limit.")

    file_id = hashlib.md5(content).hexdigest()
    stored_name = f"{file_id}{ext}"
    key = _store_key(stored_name)

    if not store.exists(key):
        store.put(key, content)

    # Warm the render cache so the first preview doesn't round-trip the store.
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    cache_path = os.path.join(UPLOAD_DIR, stored_name)
    if not os.path.exists(cache_path):
        with open(cache_path, "wb") as fh:
            fh.write(content)

    meta = {
        "id": file_id,
        "filename": os.path.basename(filename),
        "stored_name": stored_name,
        "storage_key": key,
        "storage_backend": store.name,
        "size": len(content),
        "content_type": ext.lstrip("."),
        "uploaded_by": (uploaded_by or {}).get("username") or None,
        "uploaded_by_email": (uploaded_by or {}).get("email") or None,
    }

    if db.db_available():
        try:
            db.upsert_file(meta)
        except Exception as e:
            log.warning("Could not record upload %s in Postgres: %s", stored_name, e)
    else:
        log.warning("Postgres unavailable — upload %s stored without a DB row", stored_name)

    return {
        **meta,
        "path": cache_path,
        "uri": store.uri(key),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }


def local_path(stored_name: str) -> str | None:
    """Return a real filesystem path for a stored upload, materialising it
    from the file store into the render cache if needed. None if unknown."""
    safe = os.path.basename(stored_name)
    cache_path = os.path.join(UPLOAD_DIR, safe)
    if os.path.exists(cache_path):
        return cache_path

    key = _store_key(safe)
    if not store.exists(key):
        return None
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    tmp = cache_path + ".tmp"
    with open(tmp, "wb") as fh:
        fh.write(store.get(key))
    os.replace(tmp, cache_path)
    log.info("Materialised %s from %s store into render cache", safe, store.name)
    return cache_path


def resolve_by_id_prefix(file_id_prefix: str) -> str | None:
    """Find a stored_name from a (possibly truncated) file ID."""
    if db.db_available():
        try:
            row = db.find_by_id_prefix(file_id_prefix)
            if row:
                return row["stored_name"]
        except Exception as e:
            log.warning("DB lookup failed for id prefix %s: %s", file_id_prefix, e)
    # Fall back to scanning the store, then the cache.
    for key in store.list_keys(STORE_PREFIX):
        name = key.split("/")[-1]
        if name.startswith(file_id_prefix):
            return name
    if os.path.isdir(UPLOAD_DIR):
        for name in os.listdir(UPLOAD_DIR):
            if name.startswith(file_id_prefix):
                return name
    return None


def delete_upload(stored_name: str) -> bool:
    """Delete an upload everywhere: file store, Postgres row, render cache,
    and any cached preview PDF. Returns True if anything existed."""
    safe = os.path.basename(stored_name)
    deleted = False

    try:
        deleted = store.delete(_store_key(safe)) or deleted
    except Exception as e:
        log.warning("File store delete failed for %s: %s", safe, e)

    if db.db_available():
        try:
            deleted = db.delete_file(safe) or deleted
        except Exception as e:
            log.warning("DB delete failed for %s: %s", safe, e)

    for path in (
        os.path.join(UPLOAD_DIR, safe),
        os.path.join(UPLOAD_DIR, safe) + ".preview.pdf",
    ):
        if os.path.exists(path):
            os.remove(path)
            deleted = True
    return deleted


def list_uploads() -> list[dict]:
    """Return metadata for every stored upload, newest first.
    Prefers Postgres (has original filenames); falls back to the file store."""
    if db.db_available():
        try:
            return db.list_files()
        except Exception as e:
            log.warning("DB list failed, falling back to file store: %s", e)

    items = []
    for key in store.list_keys(STORE_PREFIX):
        name = key.split("/")[-1]
        file_id, ext = os.path.splitext(name)
        items.append(
            {
                "id": file_id,
                "stored_name": name,
                "storage_key": key,
                "storage_backend": store.name,
                "size": None,
                "content_type": ext.lstrip("."),
                "uploaded_at": None,
            }
        )
    return items
