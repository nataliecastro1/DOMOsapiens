"""
Who is making this request.

Alfred fronts every deployed service with SSO and injects x-alfred-user-*
headers on each proxied request, so identity is a property of the request —
never something the client body asserts. Server-side attribution (who uploaded
a file, who edited a record) must come from here, not from a field the browser
could set to anyone's name.

Locally there is no SSO, so we report a fixed dev user.
"""
import os

# Railway (Alfred's runtime) always sets these in deployed containers — their
# absence means we're on a developer machine.
IS_DEPLOYED = bool(
    os.getenv("RAILWAY_ENVIRONMENT")
    or os.getenv("RAILWAY_PROJECT_ID")
    or os.getenv("RAILWAY_SERVICE_ID")
)

LOCAL_DEV_USER = os.getenv("LOCAL_DEV_USER", "local-dev")


def current_user(request) -> dict:
    """Resolve the caller from Alfred's SSO headers.

    Returns {authenticated, source, username, email, id}. `source` is
    "alfred-sso" when the platform identified the user, "local-dev" on a
    developer machine, or "none" when deployed without an identity (which
    should not happen behind Alfred's gateway).
    """
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
            "username": LOCAL_DEV_USER,
            "email": "",
            "id": "",
        }
    return {"authenticated": False, "source": "none", "username": "", "email": "", "id": ""}


def current_username(request) -> str:
    """Just the display name, or "" when unidentified."""
    return current_user(request)["username"]
