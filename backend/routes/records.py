from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from models import ROIRecord
from services.storage import save_record, get_all_records, export_csv, patch_executive_summary
import io

router = APIRouter(prefix="/api")


@router.post("/records")
def create_record(record: ROIRecord):
    """Save an extracted ROI record to the local JSON file."""
    saved = save_record(record)
    return {"status": "saved", "record": saved}


@router.get("/records")
def list_records():
    """Return all saved ROI records."""
    return get_all_records()


class SummaryPatch(BaseModel):
    source_file: str
    executive_summary: dict


@router.patch("/records/executive-summary")
def update_executive_summary(body: SummaryPatch):
    """Attach a generated executive summary to an existing record by source_file."""
    updated = patch_executive_summary(body.source_file, body.executive_summary)
    if not updated:
        raise HTTPException(status_code=404, detail="Record not found")
    return {"status": "updated"}


@router.get("/records/export.csv")
def download_csv():
    """Download all records as a CSV file with the 15 Domo columns."""
    csv_content = export_csv()
    return StreamingResponse(
        io.StringIO(csv_content),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=roi_export.csv"},
    )
