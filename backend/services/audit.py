"""
Append-only audit event log.

Unlike a snapshot (one row per record, overwritten in place), this is a
chronological, immutable history: every create/edit/approve is appended as a
new event and nothing is ever modified or deleted. This is what lets us answer
"who changed this number, when, from what value, and why".

File lives at backend/data/audit_log.json. Each event:

    {
      "event_id":  str,            # unique id
      "record_id": str,            # which ROI record this is about
      "timestamp": str,            # ISO 8601 UTC
      "user":      str | None,     # who did it (SME name)
      "action":    "create" | "edit" | "approve",
      "field":     str | None,     # metric key for edits (e.g. "realized_savings")
      "old_value": Any | None,     # value before the edit
      "new_value": Any | None,     # value after the edit
      "note":      str | None,     # free-text context ("client confirmed via X")
    }
"""
import json
import os
import uuid
from datetime import datetime
from typing import Any, Optional

AUDIT_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "audit_log.json")


def _load() -> list[dict]:
    os.makedirs(os.path.dirname(AUDIT_FILE), exist_ok=True)
    if not os.path.exists(AUDIT_FILE):
        return []
    with open(AUDIT_FILE, "r") as f:
        try:
            data = json.load(f)
            return data if isinstance(data, list) else []
        except json.JSONDecodeError:
            return []


def _save(events: list[dict]) -> None:
    os.makedirs(os.path.dirname(AUDIT_FILE), exist_ok=True)
    with open(AUDIT_FILE, "w") as f:
        json.dump(events, f, indent=2, default=str)


def append_event(
    record_id: str,
    action: str,
    user: Optional[str] = None,
    field: Optional[str] = None,
    old_value: Any = None,
    new_value: Any = None,
    note: Optional[str] = None,
) -> dict:
    """Append one immutable event and return it."""
    event = {
        "event_id":  uuid.uuid4().hex,
        "record_id": record_id,
        "timestamp": datetime.utcnow().isoformat(),
        "user":      user,
        "action":    action,
        "field":     field,
        "old_value": old_value,
        "new_value": new_value,
        "note":      note,
    }
    events = _load()
    events.append(event)
    _save(events)
    return event


def get_events(record_id: Optional[str] = None) -> list[dict]:
    """Return all events, or only those for one record, oldest-first."""
    events = _load()
    if record_id is not None:
        events = [e for e in events if e.get("record_id") == record_id]
    return events
