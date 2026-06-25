from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


# ─── ROI Record — the 15 Domo columns ────────────────────────────────────────
class ROIRecord(BaseModel):
    """One extracted ROAR document mapped to the 15 Domo export columns."""
    year:                    int
    client:                  str
    publisher:               str
    date_delivered:          Optional[str]   = None
    currency:                str             = "USD"
    identified_risk:         Optional[float] = None
    id_cost_avoidance:       Optional[float] = None
    acc_cost_avoidance:      Optional[float] = None
    id_cost_optimization:    Optional[float] = None
    acc_cost_optimization:   Optional[float] = None
    realized_savings:        Optional[float] = None
    contract_spend:          Optional[float] = None
    pricing_available:       Optional[bool]  = None
    notes:                   Optional[str]   = None
    elevate_deliverable:     Optional[str]   = None
    confidence:              Optional[int]   = None   # 0–100
    source_file:             Optional[str]   = None
    sme:                     Optional[str]   = None
    stored_name:             Optional[str]   = None
    executive_summary:       Optional[dict]  = None

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
