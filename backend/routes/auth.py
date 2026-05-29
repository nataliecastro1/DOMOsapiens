"""Auth routes: drive Alfred's device-authorization flow from the frontend."""

import httpx
from fastapi import APIRouter, HTTPException

from models import AuthStatus, DeviceAuthStart
from services import alfred

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/start", response_model=DeviceAuthStart)
def start():
    """Begin device authorization. Returns a URL + code for the user to approve."""
    try:
        return alfred.start_device_auth()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Alfred device authorization failed: {exc}")


@router.get("/status", response_model=AuthStatus)
def status():
    """Poll the token endpoint once and report the current auth state."""
    try:
        return alfred.poll_once()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Alfred token poll failed: {exc}")


@router.post("/logout", response_model=AuthStatus)
def logout():
    """Discard the stored token and pending device-flow state."""
    alfred.logout()
    return AuthStatus(state="unauthenticated")
