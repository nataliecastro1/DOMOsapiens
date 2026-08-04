from datetime import datetime

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse, Response
from typing import Optional
from pydantic import BaseModel

from models import ROIRecord, RecordUpdate
from models.field_catalog import FIELD_CATALOG
from services.storage import save_record, get_all_records, update_record, export_csv, export_xlsx, patch_executive_summary, clear_all_records
from services.audit import get_events
from services.identity import current_username
import io

router = APIRouter(prefix="/api")


@router.get("/fields")
def list_fields():
    """Return the field catalog: per-field label, type, notes, and the
    ui_visible / editable / exportable / provenance flags. The frontend builds
    its Tracker columns and tooltips from this, so the UI never duplicates the
    field definitions that live in models/field_catalog.py."""
    return [f.model_dump() for f in FIELD_CATALOG]


@router.post("/records")
def create_record(record: ROIRecord, request: Request):
    """Save an extracted ROI record.

    The reviewing SME is taken from Alfred's SSO identity, so the audit trail
    records who actually saved it rather than a name the client asserted."""
    sso_user = current_username(request)
    if sso_user:
        record.sme = sso_user
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


@router.delete("/records")
def delete_all_records_endpoint():
    """Permanently delete every record (full reset). Used before a clean re-import."""
    deleted = clear_all_records()
    return {"deleted": deleted}


@router.delete("/records/{record_id}")
def delete_record(record_id: str, reason: str = ""):
    """Permanently delete a record. Reason must be 'duplicate' or 'error'."""
    from services.storage import _load, _save
    allowed = {"duplicate", "error"}
    if reason.strip().lower() not in allowed:
        raise HTTPException(status_code=400, detail="invalid_reason")
    records = _load()
    new_records = [r for r in records if r.get("record_id") != record_id]
    if len(new_records) == len(records):
        raise HTTPException(status_code=404, detail="Record not found")
    _save(new_records)
    return {"status": "deleted", "record_id": record_id}


@router.patch("/records/{record_id}")
def edit_record(record_id: str, update: RecordUpdate, request: Request):
    """Apply a partial edit to a stored record. Each changed field is logged to
    the append-only audit log with the editor (from SSO) and an optional note."""
    editor = current_username(request) or update.user
    try:
        updated = update_record(
            record_id, update.changes, user=editor, note=update.note,
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
