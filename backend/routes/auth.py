"""Auth route: report who the caller is.

Alfred fronts every deployed service with SSO and injects x-alfred-user-*
headers on each proxied request, so there is nothing to negotiate — no
device flow, no tokens, no login form. Locally there is no SSO, so we
report an automatic dev user instead of prompting for credentials.
"""

import os

from fastapi import APIRouter, Request

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
    """Identify the current user without a login form."""
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
