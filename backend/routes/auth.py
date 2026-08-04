"""Auth routes: drive Alfred's device-authorization flow from the frontend."""

import os

import httpx
from fastapi import APIRouter, HTTPException, Request

from models import AuthStatus, DeviceAuthStart
from services import alfred

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Railway (Alfred's runtime) always sets these in deployed containers — their
# absence means we're on a developer machine.
IS_DEPLOYED = bool(
    os.getenv("RAILWAY_ENVIRONMENT")
    or os.getenv("RAILWAY_PROJECT_ID")
    or os.getenv("RAILWAY_SERVICE_ID")
)


@router.get("/me")
def me(request: Request):
    """Identify the current user without a login form.

    On Alfred, the platform fronts every request with SSO and injects
    x-alfred-user-* headers (same contract the delivery hub trusts).
    Locally there is no SSO, so we auto-sign-in a dev user instead of
    prompting for credentials. The form login remains only as a fallback
    when neither applies."""
    name = (request.headers.get("x-alfred-user-name") or "").strip()
    email = (request.headers.get("x-alfred-user-email") or "").strip()
    uid = (request.headers.get("x-alfred-user-id") or "").strip()
    if name or email:
        return {
            "authenticated": True,
            "source": "alfred-sso",
            "username": name or email.split("@")[0],
            "email": email,
            "id": uid,
        }
    if not IS_DEPLOYED:
        return {
            "authenticated": True,
            "source": "local-dev",
            "username": os.getenv("LOCAL_DEV_USER", "local-dev"),
            "email": "",
            "id": "",
        }
    return {"authenticated": False, "source": "none", "username": "", "email": "", "id": ""}


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
