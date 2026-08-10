"""
Local document search endpoint.

How it works:
  - Documents live in:  DOMOsapiens/backend/documents/
  - To add more files:  drop any .pdf or .pptx file into that folder.
  - The search filters by hub_deliverable_id and publisher using the filename.
  - Naming convention (recommended): PUBLISHER_HUB_DELIVERABLE_ID.pdf
    Example: IBM_12345.pdf

No restart needed when adding new files — the folder is scanned on every request.
"""

import os
from pathlib import Path
from fastapi import APIRouter
from config import DOCUMENTS_DIR

router = APIRouter(prefix="/api")

SUPPORTED_EXTENSIONS = {".pdf", ".pptx", ".ppt", ".xlsx"}


def _file_matches(filename: str, hub_deliverable_id: str, publisher: str) -> bool:
    """
    Return True if the filename contains all non-empty filter terms.
    Matching is case-insensitive and ignores underscores/spaces.
    """
    name = filename.lower().replace("_", " ").replace("-", " ")
    filters = [f for f in [hub_deliverable_id, publisher] if f and f.strip()]
    return all(f.lower() in name for f in filters)


@router.get("/documents/search")
def search_documents(hub_deliverable_id: str = "", publisher: str = ""):
    """
    Search the local documents folder.

    Query params (all optional):
      hub_deliverable_id — e.g. "12345"
      publisher          — e.g. "IBM"

    Returns a list of matching files with metadata.
    """
    os.makedirs(DOCUMENTS_DIR, exist_ok=True)
    results = []

    for entry in sorted(os.scandir(DOCUMENTS_DIR), key=lambda e: e.name):
        if not entry.is_file():
            continue
        ext = Path(entry.name).suffix.lower()
        if ext not in SUPPORTED_EXTENSIONS:
            continue

        if not _file_matches(entry.name, hub_deliverable_id, publisher):
            continue

        stat = entry.stat()
        size_kb = round(stat.st_size / 1024, 1)

        results.append({
            "name": entry.name,
            "path": entry.path,
            "size": f"{size_kb} KB",
            "extension": ext.lstrip(".").upper(),
            "modified": _format_mtime(stat.st_mtime),
        })

    return {"files": results, "total": len(results)}


@router.get("/documents/list")
def list_all_documents():
    """Return every file in the documents folder, no filtering."""
    return search_documents()


def _format_mtime(mtime: float) -> str:
    from datetime import datetime, timezone
    dt = datetime.fromtimestamp(mtime, tz=timezone.utc)
    return dt.strftime("%b %d, %Y")
