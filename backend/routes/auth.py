"""Auth route: report who the caller is.

Alfred fronts every deployed service with SSO and injects x-alfred-user-*
headers on each proxied request, so there is nothing to negotiate — no
device flow, no tokens, no login form. Locally there is no SSO, so we
report an automatic dev user. See services/identity.py.
"""

from fastapi import APIRouter, Request

from services.identity import current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/me")
def me(request: Request):
    """Identify the current user without a login form."""
    return current_user(request)
