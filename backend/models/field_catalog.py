"""Single source of truth for ROI field metadata.

Every field on `ROIRecord` is described here exactly once: its human label,
type, free-text notes, and three independent flags that drive the rest of the
app:

  • ui_visible  — does the Tracker table render this column?  (frontend reads
                  this to build its COLUMNS list; `False` = intentionally hidden)
  • editable    — can an SME correct the value inline in the Tracker?
  • exportable  — does the value flow into the Domo / XLSX export sheets?
  • provenance  — does the field carry per-metric provenance (FieldMeta)?

`ui_visible` and `exportable` are deliberately separate: a field can be hidden
in the UI but still belong in the export (e.g. `currency`, `record_id`), so we
never overload one flag to mean both.

Consumers:
  • GET /api/fields            — frontend builds the Tracker columns + tooltips
  • services.storage export    — annotates the export with notes / visibility
"""

from typing import Literal, Optional

from pydantic import BaseModel

FieldType = Literal["text", "num", "bool", "conf", "file", "date"]


class FieldDef(BaseModel):
    """Metadata describing one ROIRecord field (not the value itself)."""
    key:        str
    label:      str
    type:       FieldType
    notes:      str = ""                 # what the field means / where it comes from
    ui_visible: bool = True              # rendered in the Tracker table?
    editable:   bool = False             # inline-editable by an SME?
    exportable: bool = True              # included in the Domo / XLSX export?
    provenance: bool = False             # carries per-metric FieldMeta?


# Order here is the canonical column order for the UI and the export.
FIELD_CATALOG: list[FieldDef] = [
    FieldDef(
        key="record_id", label="Record ID", type="text",
        notes="Stable join key linking a record across all sheets and the audit log. "
              "System-generated; never edited.",
        ui_visible=False, exportable=True,
    ),
    FieldDef(
        key="client", label="Client", type="text",
        notes="Client/account name the ROAR was delivered to.",
    ),
    FieldDef(
        key="publisher", label="Publisher", type="text",
        notes="Software publisher the engagement covers (e.g. Oracle, SAP).",
    ),
    FieldDef(
        key="year", label="Year", type="text",
        notes="Reporting year the ROAR covers.",
    ),
    FieldDef(
        key="date_delivered", label="Date Delivered", type="date",
        notes="Date the ROAR was delivered to the client. Hidden in the Tracker today "
              "because it is inconsistently captured upstream.",
        ui_visible=False,
    ),
    FieldDef(
        key="currency", label="Currency", type="text",
        notes="ISO currency of the monetary metrics. Always USD today, so hidden in the "
              "UI but kept in the export for downstream correctness.",
        ui_visible=False,
    ),
    FieldDef(
        key="identified_risk", label="Identified Risk", type="num",
        notes="Total $ compliance/licensing risk identified in the ROAR.",
        editable=True, provenance=True,
    ),
    FieldDef(
        key="id_cost_avoidance", label="Identified Cost Avoidance", type="num",
        notes="$ cost avoidance identified but not yet realized.",
        editable=True, provenance=True,
    ),
    FieldDef(
        key="acc_cost_avoidance", label="Accomplished Cost Avoidance", type="num",
        notes="$ cost avoidance actually realized.",
        editable=True, provenance=True,
    ),
    FieldDef(
        key="id_cost_optimization", label="Identified Cost Optimization", type="num",
        notes="$ optimization opportunity identified but not yet realized.",
        editable=True, provenance=True,
    ),
    FieldDef(
        key="acc_cost_optimization", label="Accomplished Cost Optimization", type="num",
        notes="$ optimization actually realized.",
        editable=True, provenance=True,
    ),
    FieldDef(
        key="realized_savings", label="Realized Savings", type="num",
        notes="Total realized savings reported in the ROAR.",
        editable=True, provenance=True,
    ),
    FieldDef(
        key="contract_spend", label="Contract Spend", type="num",
        notes="Annual contract spend with the publisher.",
        editable=True, provenance=True,
    ),
    FieldDef(
        key="pricing_available", label="Pricing Available", type="bool",
        notes="Whether publisher pricing data was available for the analysis. "
              "Hidden in the Tracker; retained for the export.",
        ui_visible=False,
    ),
    FieldDef(
        key="notes", label="Notes", type="text",
        notes="Free-text analyst notes for this specific record. Hidden from the table "
              "to keep columns numeric; surfaced in the drill-down and export.",
        ui_visible=False,
    ),
    FieldDef(
        key="elevate_deliverable", label="Elevate Deliverable", type="text",
        notes="Linked Elevate deliverable, if any. Hidden in the Tracker today.",
        ui_visible=False,
    ),
    FieldDef(
        key="confidence", label="Confidence", type="conf",
        notes="Overall extractor confidence for the record (0–100).",
    ),
    FieldDef(
        key="sme", label="SME", type="text",
        notes="Subject-matter expert who reviewed / owns the record.",
    ),
    FieldDef(
        key="source_file", label="Source File", type="file",
        notes="Original ROAR file the record was extracted from.",
    ),
    FieldDef(
        key="stored_name", label="Stored Name", type="text",
        notes="Internal upload filename on disk. System field, hidden from the UI.",
        ui_visible=False,
    ),
]

# Convenience lookups.
CATALOG_BY_KEY: dict[str, FieldDef] = {f.key: f for f in FIELD_CATALOG}
VISIBLE_KEYS:   list[str] = [f.key for f in FIELD_CATALOG if f.ui_visible]
EXPORT_KEYS:    list[str] = [f.key for f in FIELD_CATALOG if f.exportable]
PROVENANCE_KEYS: list[str] = [f.key for f in FIELD_CATALOG if f.provenance]
