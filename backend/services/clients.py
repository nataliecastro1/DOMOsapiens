"""
File-based store for the client dropdown roster.

Follows the same JSON-file persistence pattern as storage.py (no separate
database engine). The list lives at backend/data/clients.json and is seeded with
a default roster on first use so the dropdown is never empty.
"""
import json
import os
from datetime import datetime, timezone

DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "clients.json")

# Initial roster — mirrors the old hard-coded CLIENTS list in the frontend.
SEED_CLIENTS = ["Encova Insurance", "Northgate LLC", "Acme Corp"]

MAX_NAME_LEN = 100


class ClientError(Exception):
    """Raised when a client name is invalid."""


def _load() -> list[dict]:
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    if not os.path.exists(DATA_FILE):
        seeded = [{"name": n, "added_at": None} for n in SEED_CLIENTS]
        _save(seeded)
        return seeded
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _save(clients: list[dict]) -> None:
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(clients, f, indent=2)


def _sorted_names(clients: list[dict]) -> list[str]:
    return sorted((c["name"] for c in clients), key=str.casefold)


def list_client_names() -> list[str]:
    """Return the roster as a sorted list of names for the dropdown."""
    return _sorted_names(_load())


def add_client(name: str) -> dict:
    """Add a client if new (case-insensitive); idempotent otherwise.

    Returns {"name": <canonical name>, "clients": <updated sorted name list>}.
    """
    clean = (name or "").strip()
    if not clean:
        raise ClientError("Client name cannot be empty.")
    if len(clean) > MAX_NAME_LEN:
        raise ClientError(f"Client name is too long (max {MAX_NAME_LEN} characters).")

    clients = _load()
    for c in clients:
        if c["name"].casefold() == clean.casefold():
            # Already exists — return the existing canonical name unchanged.
            return {"name": c["name"], "clients": _sorted_names(clients)}

    clients.append({"name": clean, "added_at": datetime.now(timezone.utc).isoformat()})
    _save(clients)
    return {"name": clean, "clients": _sorted_names(clients)}
