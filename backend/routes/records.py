from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import StreamingResponse, Response
from typing import Optional
from pydantic import BaseModel

from config import TRACKER_API_KEY
from models import ROIRecord, RecordUpdate
from models.field_catalog import FIELD_CATALOG
from services.storage import save_record, get_all_records, update_record, export_csv, export_xlsx, patch_executive_summary
from services.audit import get_events
from services import api_keys
import hmac
import io

router = APIRouter(prefix="/api")


def require_tracker_api_key(
    authorization: str | None = Header(None),
    x_tracker_api_key: str | None = Header(None),
):
    """Accept any active named key (services/api_keys), with the single
    TRACKER_API_KEY env value as a legacy fallback."""
    supplied_key = None
    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() == "bearer" and token:
            supplied_key = token.strip()
    if x_tracker_api_key:
        supplied_key = x_tracker_api_key.strip()

    # Nothing configured at all → tell the caller it's not set up.
    if not TRACKER_API_KEY and not api_keys.any_active():
        raise HTTPException(status_code=503, detail="No API keys configured. Run: python manage_keys.py create \"<name>\"")

    if not supplied_key:
        raise HTTPException(status_code=401, detail="Unauthorized: missing API key.")

    # Named keys (preferred) …
    if api_keys.verify(supplied_key):
        return
    # … or the legacy shared env key.
    if TRACKER_API_KEY and hmac.compare_digest(supplied_key, TRACKER_API_KEY):
        return

    raise HTTPException(status_code=401, detail="Unauthorized: invalid API key.")


@router.get("/fields")
def list_fields():
    """Return the field catalog: per-field label, type, notes, and the
    ui_visible / editable / exportable / provenance flags. The frontend builds
    its Tracker columns and tooltips from this, so the UI never duplicates the
    field definitions that live in models/field_catalog.py."""
    return [f.model_dump() for f in FIELD_CATALOG]


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
    identifier: Optional[str] = None   # record_id, stored_name, or source_file
    source_file: Optional[str] = None  # legacy field name kept for compatibility
    executive_summary: dict


@router.patch("/records/executive-summary")
def update_executive_summary(body: SummaryPatch):
    """Attach a generated executive summary to an existing record."""
    identifier = body.identifier or body.source_file
    if not identifier:
        raise HTTPException(status_code=400, detail="identifier or source_file required")
    updated = patch_executive_summary(identifier, body.executive_summary)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Record not found for identifier: {identifier}")
    return {"status": "updated", "record_id": updated.get("record_id")}


@router.patch("/records/{record_id}")
def edit_record(record_id: str, update: RecordUpdate):
    """Apply a partial edit to a stored record. Each changed field is logged to
    the append-only audit log with the editor and an optional note."""
    try:
        updated = update_record(
            record_id, update.changes, user=update.user, note=update.note,
        )
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Record not found: {record_id}")
    return {"status": "updated", "record": updated}


@router.get("/records/{record_id}/audit")
def record_audit(record_id: str):
    """Return the append-only audit event history for one record (oldest-first)."""
    return get_events(record_id)


@router.get("/audit-log")
def audit_log():
    """Return the full append-only audit event history across all records."""
    return get_events()


@router.get("/records/secure")
def list_records_secure(_auth: None = Depends(require_tracker_api_key)):
    """Return all saved ROI records via a secure API endpoint."""
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


@router.get("/records/export.xlsx")
def download_xlsx():
    """Download all records as an XLSX file with the 15 Domo columns + metadata."""
    xlsx_bytes = export_xlsx()
    filename = f"Client_ROI_Tracker_{datetime.now().date().isoformat()}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
