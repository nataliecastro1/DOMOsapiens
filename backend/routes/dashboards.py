"""
Saved dashboard endpoints.

Dashboards were browser-local until now; these routes make them shared state so
a saved view is visible to the whole team and survives a cache clear.
"""
from fastapi import APIRouter, HTTPException, Request

from services import dashboards
from services.identity import current_user

router = APIRouter(prefix="/api")


@router.get("/dashboards")
def list_dashboards():
    """Every saved dashboard, newest first."""
    return dashboards.list_dashboards()


@router.put("/dashboards/{dash_id}")
async def upsert_dashboard(dash_id: str, request: Request):
    """Create or replace one dashboard.

    The body is the dashboard object the UI holds; its shape is the UI's
    business, so it is stored as-is apart from id, name and owner.
    """
    body = await request.json()
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Expected a dashboard object")
    body["id"] = dash_id
    return dashboards.upsert_dashboard(body, owner=current_user(request))


@router.delete("/dashboards/{dash_id}")
def delete_dashboard(dash_id: str):
    """Remove one dashboard."""
    if not dashboards.delete_dashboard(dash_id):
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return {"status": "deleted", "id": dash_id}


@router.post("/dashboards/import")
async def import_dashboards(request: Request):
    """One-time adoption of dashboards that only exist in a browser.

    Ids already on the server are skipped, so this is safe to retry.
    """
    body = await request.json()
    items = body.get("dashboards") if isinstance(body, dict) else body
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="Expected a list of dashboards")
    adopted = dashboards.import_many(items, owner=current_user(request))
    return {"adopted": adopted, "total": len(dashboards.list_dashboards())}
