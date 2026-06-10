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
    file_path: str


@router.post("/extract")
async def extract_from_file(body: ExtractionRequest):
    """Extract ROI data from a document file using Claude API."""
    if not body.file_path.strip():
        raise HTTPException(status_code=400, detail="file_path cannot be empty")

    abs_path = _resolve_safe(body.file_path)

    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail=f"File not found: {body.file_path}")

    try:
        result = await extract_with_claude(abs_path)
        return {"status": "ok", "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
