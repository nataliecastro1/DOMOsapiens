"""
Workstream → publisher mapping endpoints.

The hub deep-links the wizard with a workstream; the wizard asks here which
publishers that workstream is allowed to report ROI for.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services import workstreams

router = APIRouter(prefix="/api")


class MappingBody(BaseModel):
    publishers: list[str]
    default: str | None = None


@router.get("/workstreams")
def list_mappings():
    """Every workstream → publisher mapping, grouped by workstream."""
    return workstreams.all_mappings()


@router.get("/publishers")
def list_publishers():
    """Every publisher already present in the records."""
    return workstreams.known_publishers()


@router.get("/workstreams/{workstream}/publishers")
def get_publishers(workstream: str):
    """Publishers this workstream may report against.

    `mapped: false` means there is no explicit mapping and the list is every
    known publisher, so the caller should let the user choose freely.
    """
    return workstreams.publishers_for(workstream)


@router.put("/workstreams/{workstream}/publishers")
def put_publishers(workstream: str, body: MappingBody):
    """Replace this workstream's allow-list. An empty list clears the mapping."""
    try:
        return workstreams.set_mapping(workstream, body.publishers, body.default)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
