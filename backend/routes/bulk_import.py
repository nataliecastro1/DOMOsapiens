import csv
import io
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from openpyxl import load_workbook

from models import ROIRecord
from services.storage import delete_by_batch_id, save_record

router = APIRouter(prefix="/api")


class SkipRow(Exception):
    """Row has partial data but can't be imported — caller should flag for review."""
    pass

# Maps spreadsheet column headers (lowercased) to ROIRecord field names.
# Covers both the user-facing labels from the sample file and the raw backend keys.
_COLUMN_MAP = {
    "year":                           "year",
    "client":                         "client",
    "publisher":                      "publisher",
    "currency":                       "currency",
    "date delivered":                 "date_delivered",
    "date_delivered":                 "date_delivered",
    "identified risk":                "identified_risk",
    "identified_risk":                "identified_risk",
    "identified cost avoidance":      "id_cost_avoidance",
    "id_cost_avoidance":              "id_cost_avoidance",
    "accomplished cost avoidance":    "acc_cost_avoidance",
    "acc_cost_avoidance":             "acc_cost_avoidance",
    "identified cost optimization":   "id_cost_optimization",
    "id_cost_optimization":           "id_cost_optimization",
    "accomplished cost optimization": "acc_cost_optimization",
    "acc_cost_optimization":          "acc_cost_optimization",
    "realized cost savings":          "realized_savings",
    "realized_savings":               "realized_savings",
    "annual publisher contract":      "contract_spend",
    "contract_spend":                 "contract_spend",
    "month":                          "month",
    "notes":                          "notes",
    "sme":                            "sme",
    "pricing available":              "pricing_available",
    "pricing_available":              "pricing_available",
}

_NUMERIC_FIELDS = {
    "identified_risk", "id_cost_avoidance", "acc_cost_avoidance",
    "id_cost_optimization", "acc_cost_optimization", "realized_savings",
    "contract_spend",
}


def _parse_number(val) -> float | None:
    """Return a float from a cell value, or None for blanks and non-numeric text."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    text = str(val).strip()
    if not text or text in ("-", "—"):
        return None
    cleaned = re.sub(r"[$,\s]", "", text)
    try:
        return float(cleaned)
    except ValueError:
        return None


def _parse_year(val) -> int | None:
    if val is None:
        return None
    if isinstance(val, int):
        return val
    try:
        return int(str(val).strip())
    except ValueError:
        return None


def _rows_from_xlsx(content: bytes) -> list[tuple[str, list[str], list[list]]]:
    """Return one entry per sheet: (sheet_name, headers, data_rows).
    The sheet name is the authoritative client name for all rows on that tab."""
    wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    sheets = []
    for ws in wb.worksheets:
        all_rows = list(ws.iter_rows(values_only=True))
        if not all_rows:
            continue
        headers = [str(h).strip() if h is not None else "" for h in all_rows[0]]
        data_rows = [list(r) for r in all_rows[1:]]
        sheets.append((ws.title, headers, data_rows))
    wb.close()
    return sheets


def _rows_from_csv(content: bytes) -> tuple[list[str], list[list]]:
    text = content.decode("utf-8-sig")  # strip BOM if present
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return [], []
    return [h.strip() for h in rows[0]], rows[1:]


def _map_row(
    headers: list[str],
    values: list,
    client_override: str | None = None,
    batch_id: str | None = None,
) -> ROIRecord | None:
    """Map one spreadsheet row to an ROIRecord.

    Returns None for genuinely blank rows (no flagging needed).
    Raises SkipRow for rows with partial data that can't be saved — caller
    should collect these and surface them to the user for review.

    client_override: when provided (e.g. the Excel tab name), it replaces whatever
    is in the 'Client' column.
    batch_id: tags the record so the whole import can be undone in one call."""
    col_index: dict[int, str] = {}
    for i, h in enumerate(headers):
        key = _COLUMN_MAP.get(h.strip().lower())
        if key:
            col_index[i] = key

    raw: dict[str, object] = {}
    for i, key in col_index.items():
        raw[key] = values[i] if i < len(values) else None

    # Truly blank row — silently skip, no need to flag.
    if all(v is None or str(v).strip() == "" for v in raw.values()):
        return None

    year_val = _parse_year(raw.get("year"))
    if not year_val:
        raw_year = raw.get("year")
        raise SkipRow(
            f"Could not parse year{f': {raw_year!r}' if raw_year is not None else ' (column missing or empty)'}"
        )

    # Tab name is authoritative; fall back to the column value only for CSV.
    client = client_override if client_override else str(raw.get("client") or "").strip()
    publisher = str(raw.get("publisher") or "").strip()
    if not publisher:
        raise SkipRow("Missing publisher")

    fields: dict = {
        "year":           year_val,
        "client":         client,
        "publisher":      publisher,
        "currency":       str(raw.get("currency") or "USD").strip(),
        "date_delivered": str(raw.get("date_delivered") or "").strip() or None,
        "month":          str(raw.get("month") or "").strip() or None,
        "notes":          str(raw.get("notes") or "").strip() or None,
        "sme":            str(raw.get("sme") or "").strip() or None,
        "source_file":    f"{client} — {publisher} — {year_val} (bulk import)",
        "batch_id":       batch_id,
    }
    for num_key in _NUMERIC_FIELDS:
        fields[num_key] = _parse_number(raw.get(num_key))

    return ROIRecord(**fields)


@router.post("/bulk-import")
async def bulk_import(file: UploadFile = File(...)):
    """Accept an XLSX or CSV file and save each data row as a tracker record.

    For XLSX files every sheet is processed — the sheet name is used as the
    authoritative client name, overriding whatever is in the 'Client' column.
    For CSV files the 'Client' column value is used directly.

    Returns a summary with per-sheet counts (XLSX) or a flat count (CSV)."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in (".xlsx", ".csv"):
        raise HTTPException(status_code=415, detail="Only .xlsx and .csv files are accepted.")

    content = await file.read()

    batch_id = f"batch_{uuid.uuid4().hex[:16]}"
    imported = 0
    errors: list[str] = []
    flagged: list[dict] = []   # rows that need review before re-upload
    sheets: list[dict] = []
    seen_keys: set[tuple] = set()  # (client_lower, publisher_lower, year) — for within-file dup detection

    def _row_data(headers: list[str], row: list, client_override: str | None) -> dict:
        """Extract all mapped field values as raw strings — used in error log entries."""
        data = {}
        for i, h in enumerate(headers):
            key = _COLUMN_MAP.get(h.strip().lower())
            if key:
                val = row[i] if i < len(row) else None
                data[key] = str(val).strip() if val is not None else ""
        if client_override:
            data["client"] = client_override
        return data

    def _process_row(row_num: int, row: list, headers: list[str],
                     client_override: str | None, location: str) -> str:
        """Try to map and save one row. Returns 'imported', 'flagged', 'blank', or 'error'."""
        nonlocal imported
        # Capture raw strings before any parsing — needed for the error log regardless
        # of which step fails, so the user can download and fix the exact row.
        raw_data = _row_data(headers, row, client_override)

        try:
            record = _map_row(headers, row, client_override=client_override, batch_id=batch_id)
            if record is None:
                return "blank"

            # Within-file duplicate: same client + publisher + year already imported
            # in this batch. Save would silently overwrite; flag it instead.
            dup_key = (record.client.lower(), record.publisher.lower(), record.year)
            if dup_key in seen_keys:
                flagged.append({
                    "location": location,
                    "row": row_num,
                    "reason": f"Duplicate — {record.client} / {record.publisher} / {record.year} already appears in this file",
                    "data": raw_data,
                })
                return "flagged"
            seen_keys.add(dup_key)

            save_record(record)
            imported += 1
            return "imported"
        except SkipRow as e:
            flagged.append({"location": location, "row": row_num, "reason": str(e), "data": raw_data})
            return "flagged"
        except Exception as e:
            errors.append(f"{location} row {row_num}: {e}")
            return "error"

    try:
        if ext == ".xlsx":
            sheet_data = _rows_from_xlsx(content)
            if not sheet_data:
                raise HTTPException(status_code=400, detail="File appears to be empty.")

            for sheet_name, headers, data_rows in sheet_data:
                s_imported = s_flagged = 0
                for row_num, row in enumerate(data_rows, start=2):
                    outcome = _process_row(row_num, row, headers, sheet_name, sheet_name)
                    if outcome == "imported":
                        s_imported += 1
                    elif outcome == "flagged":
                        s_flagged += 1
                sheets.append({"name": sheet_name, "imported": s_imported, "flagged": s_flagged})

        else:
            headers, data_rows = _rows_from_csv(content)
            if not headers:
                raise HTTPException(status_code=400, detail="File appears to be empty.")
            for row_num, row in enumerate(data_rows, start=2):
                _process_row(row_num, row, headers, None, "CSV")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse file: {e}")

    result: dict = {
        "batch_id": batch_id,
        "imported": imported,
        "flagged": flagged,
        "errors": errors,
    }
    if sheets:
        result["sheets"] = sheets
    return result


@router.delete("/bulk-import/{batch_id}")
def undo_bulk_import(batch_id: str):
    """Delete all records from a specific bulk import batch (undo a bulk import)."""
    deleted = delete_by_batch_id(batch_id)
    if deleted == 0:
        raise HTTPException(status_code=404, detail="No records found for this batch.")
    return {"deleted": deleted, "batch_id": batch_id}
