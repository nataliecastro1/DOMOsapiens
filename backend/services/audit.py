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
import os
import uuid
from datetime import datetime
from typing import Any, Optional

from services import jsonstore

AUDIT_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "audit_log.json")

# Durable in Postgres when DATABASE_URL is set; JSON file fallback otherwise.
# An audit trail that disappears on redeploy is worse than none, so this is the
# collection that most needs real persistence on Alfred.
_events = jsonstore.Collection("audit_events", AUDIT_FILE, id_key="event_id")


def _load() -> list[dict]:
    return _events.load()


def _save(events: list[dict]) -> None:
    _events.save(events)


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
    _events.append(event)  # single insert — never rewrites the history
    return event


def get_events(record_id: Optional[str] = None) -> list[dict]:
    """Return all events, or only those for one record, oldest-first."""
    events = _load()
    if record_id is not None:
        events = [e for e in events if e.get("record_id") == record_id]
    return events
