"""
Extraction endpoint — runs Claude API extraction on a local document file.

Flow:
  1. Frontend sends the file path (from /api/documents/search results)
  2. Backend sends the file directly to Claude API
  3. Claude reads the document visually and returns extracted ROI fields
  4. Frontend shows the results in the Compare screen
"""

import os
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

from services.claude_extraction import extract_with_claude
from config import DOCUMENTS_DIR

router = APIRouter(prefix="/api")


class ExtractionRequest(BaseModel):
    file_path: str  # path returned by /api/documents/search


@router.post("/extract")
async def extract_from_file(body: ExtractionRequest):
    """
    Extract ROI data from a local document using Claude API.
    Pass the file_path returned by /api/documents/search.
    """
    if not body.file_path.strip():
        raise HTTPException(status_code=400, detail="file_path cannot be empty")

    # Security: only allow files inside the documents folder
    abs_path = os.path.realpath(body.file_path)
    docs_dir = os.path.realpath(DOCUMENTS_DIR)
    if not abs_path.startswith(docs_dir):
        raise HTTPException(status_code=403, detail="Access to that path is not allowed")

    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail=f"File not found: {body.file_path}")

    try:
        result = await extract_with_claude(abs_path)
        return {"status": "ok", "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/extract/upload")
async def extract_from_upload(file: UploadFile = File(...)):
    """
    Extract ROI data from a file uploaded directly by the user
    (the manual upload card on the Request screen).
    """
    allowed = {".pdf", ".pptx", ".ppt", ".xlsx"}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    # Save the uploaded file temporarily in the documents folder
    save_path = os.path.join(DOCUMENTS_DIR, file.filename)
    os.makedirs(DOCUMENTS_DIR, exist_ok=True)

    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)

    try:
        result = await extract_with_claude(save_path)
        return {"status": "ok", "filename": file.filename, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
