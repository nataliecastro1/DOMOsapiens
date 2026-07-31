from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel


# ─── Per-field provenance ─────────────────────────────────────────────────────
class FieldMeta(BaseModel):
    """Provenance for a single extracted metric: where it came from and how
    confident the extractor was. Captured per field (one entry per metric key)
    so it can be surfaced in the Tracker drill-down and the Field_Provenance
    export sheet without cluttering the main ROI columns."""
    source_slide: Optional[int]            = None   # 1-indexed slide the value was read from
    confidence:   Optional[float]          = None   # 0–100 for THIS field
    alternates:   Optional[list[dict[str, Any]]] = None  # runner-up candidates [{value, confidence, source_slide}]


# ─── ROI Record — the 15 Domo columns ────────────────────────────────────────
class ROIRecord(BaseModel):
    """One extracted ROAR document mapped to the 15 Domo export columns."""
    record_id:               Optional[str]   = None   # stable join key across all sheets/logs
    year:                    int
    month:                   Optional[str]   = None
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
    confidence:              Optional[int]   = None   # 0–100 (overall)
    source_file:             Optional[str]   = None
    sme:                     Optional[str]   = None
    stored_name:             Optional[str]   = None
    # Per-metric provenance, keyed by model field name (e.g. "identified_risk").
    field_meta:              Optional[dict[str, FieldMeta]] = None
    executive_summary:       Optional[dict]  = None
    # Date range during which this engagement's ROI values are considered active.
    # Set by the SME during review; defaults to Jan 1 – Dec 31 of `year`.
    applicable_from:         Optional[str]   = None
    applicable_to:           Optional[str]   = None
    # Per-field overrides for values whose active window differs from the record default.
    # {"identified_risk": {"from": "2024-01-01", "to": "2024-06-30"}, ...}
    field_dates:             Optional[dict]  = None
    # Set by bulk import to group records from the same upload for undo support.
    batch_id:                Optional[str]   = None


class RecordUpdate(BaseModel):
    """Body for editing a stored record. `changes` is a partial map of
    {field_name: new_value}; the edit is logged to the append-only audit log
    with the editor (`user`) and an optional `note` explaining why."""
    changes: dict[str, Any]
    user:    Optional[str] = None
    note:    Optional[str] = None
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
