"""Client-scope routes: expose Alfred's client list to our frontend."""

from typing import List

import httpx
from fastapi import APIRouter, HTTPException

from models import ClientScope
from services import alfred
from services.client_scope import fetch_client_scopes

router = APIRouter(prefix="/api", tags=["client-scopes"])


@router.get("/client-scopes", response_model=List[ClientScope])
def client_scopes():
    """Return the full list of Alfred client scopes (id + name)."""
    try:
        return fetch_client_scopes()
    except alfred.AlfredAuthError as exc:
        # 401 signals the frontend to kick off /api/auth/start.
        raise HTTPException(status_code=401, detail=str(exc))
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Failed to reach Alfred: {exc}")
