"""
Named API keys for the secure tracker endpoints.

Each key is issued by an admin with a human label (e.g. "Domo-prod"), and is
stored **hashed** — the plaintext is shown exactly once at creation and never
persisted. Keys can be revoked individually without affecting the others.

File: backend/data/api_keys.json. Entry shape:

    {
      "id": "ab12cd34ef56",        # short id used to revoke
      "name": "Domo-prod",         # human label
      "key_hash": "<sha256 hex>",  # hash of the full key (no plaintext stored)
      "display": "tk_A1b2C3…",     # safe prefix for listings
      "created_at": "...", "last_used_at": "...|null",
      "revoked": false, "revoked_at": "...|null"
    }

Keys are high-entropy random tokens, so a single SHA-256 is sufficient (unlike
low-entropy passwords, which would need a slow KDF).
"""
import hashlib
import hmac
import os
import secrets
import uuid
from datetime import datetime

from services import jsonstore

KEYS_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "api_keys.json")
KEY_PREFIX = "tk_"

# Durable in Postgres when DATABASE_URL is set; JSON file fallback otherwise.
# Only sha256 hashes are stored, never the raw key.
_keys = jsonstore.Collection("api_keys", KEYS_FILE, id_key="id")


def _load() -> list[dict]:
    return _keys.load()


def _save(keys: list[dict]) -> None:
    _keys.save(keys)


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def create_key(name: str) -> tuple[str, dict]:
    """Mint a new key. Returns (plaintext_key, stored_entry). The plaintext is
    the ONLY time the full key is available — store the entry, hand back the key."""
    raw = KEY_PREFIX + secrets.token_urlsafe(32)
    entry = {
        "id":           uuid.uuid4().hex[:12],
        "name":         name,
        "key_hash":     _hash(raw),
        "display":      raw[:len(KEY_PREFIX) + 6] + "…",
        "created_at":   datetime.utcnow().isoformat(),
        "last_used_at": None,
        "revoked":      False,
        "revoked_at":   None,
    }
    keys = _load()
    keys.append(entry)
    _save(keys)
    return raw, entry


def verify(raw: str) -> dict | None:
    """Return the matching, non-revoked key entry (and stamp last_used_at), or None."""
    if not raw:
        return None
    h = _hash(raw)
    keys = _load()
    for k in keys:
        if not k.get("revoked") and hmac.compare_digest(k.get("key_hash", ""), h):
            k["last_used_at"] = datetime.utcnow().isoformat()
            _save(keys)
            return k
    return None


def list_keys() -> list[dict]:
    """All keys WITHOUT the hash (safe to display)."""
    return [{kk: v for kk, v in k.items() if kk != "key_hash"} for k in _load()]


def revoke(key_id: str) -> bool:
    """Revoke a key by id. Returns True if a live key was revoked."""
    keys = _load()
    for k in keys:
        if k["id"] == key_id and not k.get("revoked"):
            k["revoked"] = True
            k["revoked_at"] = datetime.utcnow().isoformat()
            _save(keys)
            return True
    return False


def any_active() -> bool:
    return any(not k.get("revoked") for k in _load())
