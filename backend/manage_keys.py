#!/usr/bin/env python3
"""
Admin CLI for tracker API keys.

    python manage_keys.py create "Domo-prod"     # issue a new named key
    python manage_keys.py list                    # show all keys (no secrets)
    python manage_keys.py revoke <id>             # revoke a key by id

The full key value is printed ONCE on creation — copy it then; it is stored
hashed and cannot be recovered. Hand it to the integrator over a secure channel.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from services import api_keys


def cmd_create(name):
    raw, entry = api_keys.create_key(name)
    print(f"\n  ✓ Issued key '{entry['name']}'  (id: {entry['id']})\n")
    print(f"      {raw}\n")
    print("  ⚠ Copy it now — it is stored hashed and will not be shown again.")
    print("    Send it to the integrator securely; they use it as the")
    print("    X-Tracker-Api-Key header (or Authorization: Bearer <key>).\n")


def cmd_list():
    keys = api_keys.list_keys()
    if not keys:
        print("No keys issued yet. Create one: python manage_keys.py create \"Name\"")
        return
    print(f"\n  {'ID':14} {'NAME':22} {'KEY':14} {'STATUS':9} LAST USED")
    print("  " + "-" * 78)
    for k in keys:
        status = "revoked" if k.get("revoked") else "active"
        print(f"  {k['id']:14} {k['name'][:22]:22} {k['display']:14} {status:9} {k.get('last_used_at') or '—'}")
    print()


def cmd_revoke(key_id):
    if api_keys.revoke(key_id):
        print(f"  ✓ Revoked key {key_id}")
    else:
        print(f"  ✗ No active key with id {key_id}")


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return
    cmd, *rest = args
    if cmd == "create" and rest:
        cmd_create(" ".join(rest))
    elif cmd == "list":
        cmd_list()
    elif cmd == "revoke" and rest:
        cmd_revoke(rest[0])
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
