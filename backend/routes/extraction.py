from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.extraction import extract_roi_from_text

router = APIRouter(prefix="/api")


class ExtractionRequest(BaseModel):
    document_text: str


@router.post("/extract")
async def extract(body: ExtractionRequest):
    """Receive document text, send to Claude, return extracted ROI fields."""
    if not body.document_text.strip():
        raise HTTPException(status_code=400, detail="document_text cannot be empty")
    try:
        result = await extract_roi_from_text(body.document_text)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
