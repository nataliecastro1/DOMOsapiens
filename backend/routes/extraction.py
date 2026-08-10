"""
Extraction endpoint — runs Claude API extraction on a local document file.
Accepts files from both backend/documents/ and backend/data/uploads/
"""

import os
from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from pydantic import BaseModel

from services.claude_extraction import extract_with_claude
from services.uploads import UPLOAD_DIR, local_path, resolve_by_id_prefix
from config import DOCUMENTS_DIR
from services.db import create_extraction_job, update_extraction_job, get_extraction_job, get_user_extraction_jobs
from services.identity import current_user

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
    file_path: str = ""
    file_id: str = ""     # id from /api/uploads response
    stored_name: str = "" # stored_name from /api/uploads response
    name: str = ""        # original user-facing filename


async def process_extraction_job(job_id: str, abs_path: str):
    update_extraction_job(job_id, "PROCESSING")
    try:
        result = await extract_with_claude(abs_path)
        update_extraction_job(job_id, "COMPLETED", result_data=result)
    except Exception as e:
        update_extraction_job(job_id, "FAILED", error_message=str(e))


@router.post("/extract")
async def extract_from_file(request: Request, body: ExtractionRequest, background_tasks: BackgroundTasks):
    """Start an asynchronous extraction job for a document file."""

    user = current_user(request)
    
    # Resolve which file to use — by id/stored_name (uploads) or by path (documents)
    abs_path = None

    if body.file_id or body.stored_name:
        # Uploaded file — local_path pulls it from the file store if the
        # render cache is cold (e.g. after a redeploy on Alfred).
        stored = body.stored_name or body.file_id
        abs_path = local_path(stored)
        if not abs_path and body.file_id:
            resolved = resolve_by_id_prefix(body.file_id)
            if resolved:
                abs_path = local_path(resolved)

    elif body.file_path.strip():
        abs_path = _resolve_safe(body.file_path)

    if not abs_path or not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="File not found")

    original_filename = body.name or body.stored_name or os.path.basename(abs_path)
    job_id = create_extraction_job(
        file_path=abs_path,
        user_id=user["id"],
        user_email=user["email"],
        original_filename=original_filename
    )
    background_tasks.add_task(process_extraction_job, job_id, abs_path)
    return {"status": "PENDING", "job_id": job_id}


@router.get("/extract/jobs")
async def list_extraction_jobs(request: Request):
    """List all background extraction jobs for the current user."""
    user = current_user(request)
    if not user["id"]:
        return []
    return get_user_extraction_jobs(user["id"])


@router.get("/extract/{job_id}")
async def get_extraction_status(job_id: str):
    """Poll the status of an extraction job."""
    job = get_extraction_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
