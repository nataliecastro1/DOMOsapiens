"""
Extraction endpoint — runs Claude API extraction on a local document file.
Accepts files from both backend/documents/ and backend/data/uploads/
"""

import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.claude_extraction import extract_with_claude
from services.uploads import UPLOAD_DIR
from config import DOCUMENTS_DIR

router = APIRouter(prefix="/api")

ALLOWED_DIRS = [
    os.path.realpath(DOCUMENTS_DIR),
    os.path.realpath(UPLOAD_DIR),
]


def _resolve_safe(file_path: str) -> str:
    """Return the absolute path if it's inside an allowed directory, else raise."""
    abs_path = os.path.realpath(file_path)
    if any(abs_path.startswith(d) for d in ALLOWED_DIRS):
        return abs_path
    raise HTTPException(status_code=403, detail="Access to that path is not allowed")


class ExtractionRequest(BaseModel):
    file_path: str = ""
    file_id: str = ""     # id from /api/uploads response
    stored_name: str = "" # stored_name from /api/uploads response


@router.post("/extract")
async def extract_from_file(body: ExtractionRequest):
    """Extract ROI data from a document file using Claude API."""

    # Resolve which file to use — by id/stored_name (uploads) or by path (documents)
    abs_path = None

    if body.file_id or body.stored_name:
        # File from uploads folder
        stored = body.stored_name or body.file_id
        candidate = os.path.realpath(os.path.join(UPLOAD_DIR, stored))
        if os.path.exists(candidate):
            abs_path = candidate
        else:
            # Try finding by id prefix
            for f in os.listdir(UPLOAD_DIR):
                if f.startswith(body.file_id):
                    abs_path = os.path.join(UPLOAD_DIR, f)
                    break

    elif body.file_path.strip():
        abs_path = _resolve_safe(body.file_path)

    if not abs_path or not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="File not found")

    try:
        result = await extract_with_claude(abs_path)
        return {"status": "ok", "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
