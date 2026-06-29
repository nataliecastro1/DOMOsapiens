#!/usr/bin/env python3
"""
Example client for the DOMOsapiens ROI Tracker API.

Pulls the saved ROI records (the same data behind the Tracker + Dashboards)
so they can be fed into Domo or any BI pipeline, and shows how to edit a
record (every change is written to the append-only audit log).

Zero third-party dependencies — standard library only, so it runs anywhere
Python 3 is installed.

    export TRACKER_API_KEY="your-secret-key"          # must match backend .env
    export TRACKER_API_BASE="http://localhost:8000"   # optional, this is default
    python tracker_api_client.py
"""
import json
import os
import urllib.error
import urllib.request

BASE = os.environ.get("TRACKER_API_BASE", "http://localhost:8000").rstrip("/")
API_KEY = os.environ.get("TRACKER_API_KEY", "")


def _request(method, path, body=None):
    """Tiny JSON HTTP helper over urllib."""
    url = f"{BASE}/api{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if API_KEY:
        req.add_header("X-Tracker-Api-Key", API_KEY)   # or: Authorization: Bearer <key>
    if data is not None:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def get_records():
    """Fetch every saved ROI record via the secure (API-key) endpoint.

    Falls back to the open read endpoint for local dev when no key is set on
    the backend (the secure route returns 503 until TRACKER_API_KEY is config'd).
    """
    try:
        return _request("GET", "/records/secure")
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 503):
            print(f"  (secure endpoint unavailable: {exc.code} — falling back to /records)\n")
            return _request("GET", "/records")
        raise


def update_record(record_id, changes, user, note):
    """Edit one or more fields on a record. Each change is logged with the
    editor and note. `changes` is a partial {field: new_value} map."""
    return _request("PATCH", f"/records/{record_id}",
                    {"changes": changes, "user": user, "note": note})


def main():
    records = get_records()
    print(f"Fetched {len(records)} ROI records\n")
    for r in records[:5]:
        print(f"  {r['client']:24.24} {str(r['publisher']):10.10} {r['year']}  "
              f"realized=${(r.get('realized_savings') or 0):>12,.0f}  "
              f"conf={r.get('confidence')}  {r['record_id']}")

    # ── Example edit (uncomment to run) ───────────────────────────────────────
    # result = update_record(
    #     records[0]["record_id"],
    #     {"realized_savings": 500000},
    #     user="Integration Bot",
    #     note="Backfilled from client confirmation",
    # )
    # print("\nUpdated:", result["record"]["record_id"])


if __name__ == "__main__":
    main()
