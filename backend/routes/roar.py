"""ROAR routes: accept a .pptx upload and return extracted ROI fields."""

import os
import tempfile

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from services.roar_extractor import extract_roar

router = APIRouter(prefix="/api", tags=["roar"])


@router.post("/roar/extract")
async def roar_extract(file: UploadFile = File(...)):
    """Extract ROI fields from an uploaded ROAR .pptx file."""
    if not file.filename.lower().endswith((".pptx", ".ppt")):
        raise HTTPException(status_code=400, detail="Please upload a .pptx file.")

    # extract_roar() takes a path, so spool the upload to a temp file.
    suffix = os.path.splitext(file.filename)[1] or ".pptx"
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name
        return extract_roar(tmp_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {exc}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)
