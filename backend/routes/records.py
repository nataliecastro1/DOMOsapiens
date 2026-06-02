from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from models import ROIRecord
from services.storage import save_record, get_all_records, export_csv
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


@router.get("/records/export.csv")
def download_csv():
    """Download all records as a CSV file with the 15 Domo columns."""
    csv_content = export_csv()
    return StreamingResponse(
        io.StringIO(csv_content),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=roi_export.csv"},
    )
