"""Fetch the client-scope list from Alfred's delivery-hub API."""

from __future__ import annotations

from typing import List

import httpx

from config import ALFRED_BASE_URL
from models import ClientScope
from services import alfred

CLIENT_SCOPE_PATH = "/app/delivery-hub/v1/client-scope-ids"


def fetch_client_scopes() -> List[ClientScope]:
    """Return the full list of client scopes (id + name).

    Raises AlfredAuthError when there is no valid token, or when Alfred responds
    in a way that indicates the token is no longer accepted (401 or the SSO
    login HTML instead of JSON).
    """
    token = alfred.get_access_token()

    resp = httpx.get(
        f"{ALFRED_BASE_URL}{CLIENT_SCOPE_PATH}",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        },
        timeout=30,
        follow_redirects=False,
    )

    # 401/403 or a redirect to login => token rejected.
    if resp.status_code in (401, 403) or resp.is_redirect:
        alfred.invalidate_token()
        raise alfred.AlfredAuthError("Alfred rejected the token (re-authentication required).")

    resp.raise_for_status()

    try:
        data = resp.json()
    except ValueError:
        # Unauthenticated requests get served the SSO login HTML, not JSON.
        alfred.invalidate_token()
        raise alfred.AlfredAuthError(
            "Alfred returned a non-JSON response (likely the login page); re-authentication required."
        )

    return [ClientScope(**item) for item in data]
