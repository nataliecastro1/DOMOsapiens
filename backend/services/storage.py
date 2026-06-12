"""
Simple file-based storage — saves ROI records to a local JSON file.
No database needed. File lives at backend/data/roi_records.json.
"""
import csv
import io
import json
import os
from datetime import datetime
from models import ROIRecord

DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "roi_records.json")

DOMO_COLUMNS = [
    "year", "client", "publisher", "date_delivered", "currency",
    "identified_risk", "id_cost_avoidance", "acc_cost_avoidance",
    "id_cost_optimization", "acc_cost_optimization", "realized_savings",
    "contract_spend", "pricing_available", "notes", "elevate_deliverable",
]


def _load() -> list[dict]:
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    if not os.path.exists(DATA_FILE):
        return []
    with open(DATA_FILE, "r") as f:
        return json.load(f)


def _save(records: list[dict]):
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    with open(DATA_FILE, "w") as f:
        json.dump(records, f, indent=2, default=str)


def save_record(record: ROIRecord) -> dict:
    """Upsert an ROI record by source_file — prevents duplicates."""
    records = _load()
    entry = record.model_dump()
    entry["saved_at"] = datetime.utcnow().isoformat()

    if entry.get("source_file"):
        for i, r in enumerate(records):
            if r.get("source_file") == entry["source_file"]:
                records[i] = entry
                _save(records)
                return entry

    records.append(entry)
    _save(records)
    return entry


def get_all_records() -> list[dict]:
    return _load()


def export_csv() -> str:
    """Return all records as a CSV string with the 15 Domo columns."""
    records = _load()
    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=DOMO_COLUMNS,
        extrasaction="ignore",
        lineterminator="\n",
    )
    writer.writeheader()
    for r in records:
        writer.writerow(r)
    return output.getvalue()
