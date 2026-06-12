import os
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from services.uploads import UploadError, UPLOAD_DIR, list_uploads, save_upload

router = APIRouter(prefix="/api")


@router.post("/uploads")
async def upload_file(file: UploadFile = File(...)):
    """Accept a source document (PPTX/PDF/XLSX) and store it on disk."""
    content = await file.read()
    try:
        return save_upload(file.filename, content)
    except UploadError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/uploads")
def get_uploads():
    """List previously uploaded files, newest first."""
    return list_uploads()


@router.get("/uploads/{stored_name}")
def serve_upload(stored_name: str):
    """Serve an uploaded file by its stored name."""
    safe = os.path.basename(stored_name)
    path = os.path.join(UPLOAD_DIR, safe)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path)
