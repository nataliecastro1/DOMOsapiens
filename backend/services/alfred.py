"""Alfred OAuth device-authorization flow + token management.

Alfred issues short-lived (~1 hour) bearer tokens via a Device Authorization
Grant and has no static API keys or refresh tokens. Once a token expires a human
must re-approve. We hold the token server-side in a module-level store and cache
it to disk so a dev-server reload doesn't force re-auth within the hour.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

from config import ALFRED_BASE_URL, ALFRED_TOKEN_FILE
from models import AuthStatus, DeviceAuthStart

DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code"

# Treat a token as expired slightly early to avoid using it mid-flight.
_EXPIRY_SKEW = timedelta(seconds=30)


class AlfredAuthError(Exception):
    """Raised when a valid Alfred token is not available."""


@dataclass
class _TokenStore:
    access_token: Optional[str] = None
    expires_at: Optional[datetime] = None
    # Pending device-flow state (set by start_device_auth, cleared on success).
    device_code: Optional[str] = None
    interval: int = 5
    device_expires_at: Optional[datetime] = None
    denied: bool = False

    def is_token_valid(self) -> bool:
        return (
            self.access_token is not None
            and self.expires_at is not None
            and datetime.now(timezone.utc) < self.expires_at - _EXPIRY_SKEW
        )


_store = _TokenStore()


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --- token persistence -----------------------------------------------------

def _persist_token() -> None:
    if not _store.access_token or not _store.expires_at:
        return
    try:
        with open(ALFRED_TOKEN_FILE, "w", encoding="utf-8") as fh:
            json.dump(
                {
                    "access_token": _store.access_token,
                    "expires_at": _store.expires_at.isoformat(),
                },
                fh,
            )
    except OSError:
        # Caching is best-effort; failing to write must not break auth.
        pass


def _load_token() -> None:
    if _store.access_token is not None:
        return
    try:
        with open(ALFRED_TOKEN_FILE, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        _store.access_token = data["access_token"]
        _store.expires_at = datetime.fromisoformat(data["expires_at"])
    except (OSError, KeyError, ValueError):
        pass


def _clear_persisted_token() -> None:
    try:
        os.remove(ALFRED_TOKEN_FILE)
    except OSError:
        pass


# load any cached token at import time
_load_token()


# --- device flow -----------------------------------------------------------

def start_device_auth() -> DeviceAuthStart:
    """Begin the device-authorization flow and store the pending device_code."""
    resp = httpx.post(
        f"{ALFRED_BASE_URL}/oauth/device_authorization",
        json={},
        headers={"Accept": "application/json"},
        timeout=20,
    )
    resp.raise_for_status()
    data = resp.json()

    _store.device_code = data["device_code"]
    _store.interval = int(data.get("interval", 5))
    _store.device_expires_at = _now() + timedelta(
        seconds=int(data.get("expires_in", 600))
    )
    _store.denied = False

    return DeviceAuthStart(
        verification_uri_complete=data.get("verification_uri_complete")
        or data["verification_uri"],
        user_code=data["user_code"],
        expires_in=int(data.get("expires_in", 600)),
        interval=_store.interval,
    )


def poll_once() -> AuthStatus:
    """Poll the token endpoint once, advancing the flow while pending.

    Returns the current AuthStatus. The frontend should call this repeatedly at
    the `interval` returned by start_device_auth until the state is terminal.
    """
    # Already have a valid token? Nothing to do.
    if _store.is_token_valid():
        return AuthStatus(state="authenticated", expires_at=_store.expires_at)

    if _store.denied:
        return AuthStatus(state="denied")

    if _store.device_code is None:
        return current_status()

    if _store.device_expires_at and _now() >= _store.device_expires_at:
        _store.device_code = None
        return AuthStatus(state="expired")

    resp = httpx.post(
        f"{ALFRED_BASE_URL}/oauth/token",
        json={
            "grant_type": DEVICE_GRANT_TYPE,
            "device_code": _store.device_code,
        },
        headers={"Accept": "application/json"},
        timeout=20,
    )

    # Success: 2xx with an access_token.
    if resp.is_success:
        data = resp.json()
        token = data.get("access_token")
        if token:
            _store.access_token = token
            _store.expires_at = _now() + timedelta(
                seconds=int(data.get("expires_in", 3600))
            )
            _store.device_code = None
            _persist_token()
            return AuthStatus(state="authenticated", expires_at=_store.expires_at)

    # Pending / error: device-grant errors come back as {"error": "..."}.
    try:
        error = resp.json().get("error")
    except ValueError:
        error = None

    if error == "authorization_pending":
        return AuthStatus(state="pending")
    if error == "slow_down":
        _store.interval += 5
        return AuthStatus(state="pending")
    if error == "access_denied":
        _store.denied = True
        _store.device_code = None
        return AuthStatus(state="denied")
    if error == "expired_token":
        _store.device_code = None
        return AuthStatus(state="expired")

    # Unknown response — surface as pending so a transient hiccup keeps polling.
    return AuthStatus(state="pending")


def current_status() -> AuthStatus:
    """Report token status from the store without any network call."""
    if _store.is_token_valid():
        return AuthStatus(state="authenticated", expires_at=_store.expires_at)
    if _store.access_token is not None:
        # Had a token but it lapsed.
        return AuthStatus(state="expired")
    if _store.device_code is not None:
        return AuthStatus(state="pending")
    return AuthStatus(state="unauthenticated")


def logout() -> None:
    """Discard any token and pending device-flow state."""
    _store.access_token = None
    _store.expires_at = None
    _store.device_code = None
    _store.device_expires_at = None
    _store.denied = False
    _clear_persisted_token()


def get_access_token() -> str:
    """Return a valid access token or raise AlfredAuthError."""
    if not _store.is_token_valid():
        raise AlfredAuthError("Not authenticated with Alfred (token missing or expired).")
    return _store.access_token  # type: ignore[return-value]


def invalidate_token() -> None:
    """Drop the current token (e.g. after a 401 from the API)."""
    _store.access_token = None
    _store.expires_at = None
    _clear_persisted_token()
