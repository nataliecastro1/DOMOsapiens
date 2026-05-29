from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel

AuthState = Literal[
    "unauthenticated",
    "pending",
    "authenticated",
    "expired",
    "denied",
]


class ClientScope(BaseModel):
    client_scope_pathfinder_id: str
    client_scope_name: str


class DeviceAuthStart(BaseModel):
    verification_uri_complete: str
    user_code: str
    expires_in: int
    interval: int


class AuthStatus(BaseModel):
    state: AuthState
    expires_at: Optional[datetime] = None
