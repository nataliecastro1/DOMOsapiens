"""
Persists uploaded source documents (PPTX / PDF / XLSX) to local disk.

No database — files live under backend/data/uploads/ with a unique stored name,
mirroring the file-based approach used in storage.py. The original filename is
preserved in the returned metadata so the UI can still show it to the user.
"""
import os
import uuid
from datetime import datetime, timezone

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "uploads")

# Extensions the Upload card in the Extraction view advertises.
ALLOWED_EXTENSIONS = {".pptx", ".ppt", ".pdf", ".xlsx"}
MAX_BYTES = 50 * 1024 * 1024  # 50 MB


class UploadError(Exception):
    """Raised when an uploaded file is rejected (bad type, too large, empty)."""


def _ext(filename: str) -> str:
    return os.path.splitext(filename or "")[1].lower()


def validate(filename: str) -> str:
    """Return the lower-cased extension, or raise UploadError if unsupported."""
    ext = _ext(filename)
    if ext not in ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise UploadError(
            f"Unsupported file type '{ext or 'unknown'}'. Allowed: {allowed}."
        )
    return ext


def save_upload(filename: str, content: bytes) -> dict:
    """Persist an uploaded file under a unique name; return its metadata."""
    ext = validate(filename)
    if not content:
        raise UploadError("Uploaded file is empty.")
    if len(content) > MAX_BYTES:
        raise UploadError(f"File exceeds the {MAX_BYTES // (1024 * 1024)} MB limit.")

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file_id = uuid.uuid4().hex
    stored_name = f"{file_id}{ext}"
    with open(os.path.join(UPLOAD_DIR, stored_name), "wb") as fh:
        fh.write(content)

    full_path = os.path.join(UPLOAD_DIR, stored_name)
    return {
        "id": file_id,
        "filename": os.path.basename(filename),
        "stored_name": stored_name,
        "path": full_path,
        "size": len(content),
        "content_type": ext.lstrip("."),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }


def list_uploads() -> list[dict]:
    """Return metadata for every stored upload, newest first."""
    if not os.path.isdir(UPLOAD_DIR):
        return []
    items = []
    for name in os.listdir(UPLOAD_DIR):
        path = os.path.join(UPLOAD_DIR, name)
        if not os.path.isfile(path):
            continue
        stat = os.stat(path)
        file_id, ext = os.path.splitext(name)
        items.append(
            {
                "id": file_id,
                "stored_name": name,
                "size": stat.st_size,
                "content_type": ext.lstrip("."),
                "uploaded_at": datetime.fromtimestamp(
                    stat.st_mtime, timezone.utc
                ).isoformat(),
            }
        )
    return sorted(items, key=lambda x: x["uploaded_at"], reverse=True)
