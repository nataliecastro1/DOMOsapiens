"""
The `roi_records` column contract, in one place.

services/storage.py builds its SQL from these lists, and services/migrate.py
uses them to decide which keys of a legacy JSONB document map onto real columns
— anything not listed is simply dropped, which is how retired keys like
`hub_scope_id` get left behind without needing a special case.
"""

# Scalar columns, in table order. `record_id`, `seq`, `saved_at` and
# `updated_at` are managed separately by storage.py.
SCALAR: list[str] = [
    "month", "publisher", "date_delivered", "currency",
    "identified_risk", "id_cost_avoidance", "acc_cost_avoidance",
    "id_cost_optimization", "acc_cost_optimization", "realized_savings",
    "contract_spend",
    "pricing_available", "notes", "elevate_deliverable", "confidence",
    "source_file", "sme", "stored_name",
    "applicable_from", "applicable_to",
    # Delivery-hub provenance. `workstream` is the hub's team — the set the
    # publisher was chosen from, not a replacement for it.
    "workstream",
    "hub_deliverable_id", "hub_deliverable_name", "hub_pathfinder_id",
    "client_scope_name",
    "hub_saved_at", "hub_roi_metric_id",
    "batch_id",
]

# Nested values stored as JSONB.
JSON: list[str] = ["field_meta", "executive_summary", "field_dates"]

# Everything a caller may write.
WRITABLE: list[str] = SCALAR + JSON

# Columns that are NOT NULL in the table, with the value to coerce blanks to.
NOT_NULL_TEXT_DEFAULTS: dict[str, str] = {
    "publisher": "",
    "currency": "USD",
}

# Integer-typed columns, for coercing values that arrive as strings.
INT_COLUMNS: set[str] = {
    "confidence", "hub_deliverable_id", "hub_roi_metric_id",
}

# Money columns, all DOUBLE PRECISION.
FLOAT_COLUMNS: set[str] = {
    "identified_risk", "id_cost_avoidance", "acc_cost_avoidance",
    "id_cost_optimization", "acc_cost_optimization", "realized_savings",
    "contract_spend",
}

BOOL_COLUMNS: set[str] = {"pricing_available"}

# Fields whose changes are worth an audit event when a record is re-extracted.
AUDITED: list[str] = [
    "identified_risk", "id_cost_avoidance", "acc_cost_avoidance",
    "id_cost_optimization", "acc_cost_optimization", "realized_savings",
    "contract_spend", "applicable_from", "applicable_to", "field_dates",
    "publisher",
]
