from fastapi import APIRouter, File, HTTPException, UploadFile

from services.uploads import UploadError, list_uploads, save_upload

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
