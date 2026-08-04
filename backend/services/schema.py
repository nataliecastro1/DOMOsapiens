"""
Every table this app owns, in one place.

Previously each service created its own table lazily on first use, which meant a
missing GRANT surfaced as a failed user save rather than a failed deploy. All
DDL now lives here and runs once from `db.init_db()` at startup, so a schema or
permission problem shows up in the deploy logs where it belongs.

Everything is `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`, so applying this
repeatedly is safe — it doubles as the migration path for existing databases.
"""

# ── files: one row per uploaded source document ───────────────────────────────
FILES = """
CREATE TABLE IF NOT EXISTS files (
    id              TEXT PRIMARY KEY,          -- md5 of content (stable dedup id)
    filename        TEXT NOT NULL,             -- original client filename
    stored_name     TEXT NOT NULL UNIQUE,      -- <id><ext>, key stem in the store
    storage_key     TEXT NOT NULL,             -- full key in the file store
    storage_backend TEXT NOT NULL,             -- 'local' | 's3'
    content_type    TEXT,
    size_bytes      BIGINT,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Attribution comes from Alfred's SSO headers, never the request body.
ALTER TABLE files ADD COLUMN IF NOT EXISTS uploaded_by       TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS uploaded_by_email TEXT;
"""

# ── json_documents: generic JSONB collections ─────────────────────────────────
# Now holds only `audit_events`, which is genuinely append-only document data.
# `roi_records` graduated to its own typed table (see ROI_RECORDS below).
JSON_DOCUMENTS = """
CREATE TABLE IF NOT EXISTS json_documents (
    collection  TEXT   NOT NULL,
    doc_id      TEXT   NOT NULL,
    seq         BIGSERIAL,
    data        JSONB  NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (collection, doc_id)
);
CREATE INDEX IF NOT EXISTS json_documents_collection_seq
    ON json_documents (collection, seq);
"""

# ── roi_records: one row per extracted ROAR ───────────────────────────────────
# Scalars get real columns so the Tracker and the bulk-import duplicate check
# can be indexed queries instead of loading every record into Python. Only the
# genuinely nested values stay JSONB.
#
# `publisher` is the ROI dimension and is required. `workstream` is the hub's
# team, carried as provenance — it is what the publisher was chosen from, not a
# substitute for it (see workstream_publishers below).
#
# Constraints reflect what the data actually supports:
#   • record_id is the PK — all 630 legacy rows had one, and all were distinct.
#   • stored_name is UNIQUE but nullable: bulk-imported rows have no upload, and
#     Postgres permits many NULLs under a UNIQUE constraint.
#   • (client, publisher, year) is indexed but NOT unique — `month` exists, so
#     two ROARs in the same year for one client/publisher are legitimate.
#     Duplicate detection stays an application decision in bulk_import, which
#     flags them for review rather than rejecting them outright.
#   • seq preserves insertion order, which is the order the Tracker expects.
ROI_RECORDS = """
CREATE TABLE IF NOT EXISTS roi_records (
    record_id               TEXT PRIMARY KEY,
    seq                     BIGSERIAL,

    year                    INTEGER NOT NULL,
    month                   TEXT,
    client                  TEXT NOT NULL,
    publisher               TEXT NOT NULL,
    date_delivered          TEXT,
    currency                TEXT NOT NULL DEFAULT 'USD',

    identified_risk         DOUBLE PRECISION,
    id_cost_avoidance       DOUBLE PRECISION,
    acc_cost_avoidance      DOUBLE PRECISION,
    id_cost_optimization    DOUBLE PRECISION,
    acc_cost_optimization   DOUBLE PRECISION,
    realized_savings        DOUBLE PRECISION,
    contract_spend          DOUBLE PRECISION,

    pricing_available       BOOLEAN,
    notes                   TEXT,
    elevate_deliverable     TEXT,
    confidence              INTEGER,
    source_file             TEXT,
    sme                     TEXT,
    stored_name             TEXT UNIQUE,

    applicable_from         TEXT,
    applicable_to           TEXT,

    -- Genuinely nested values: per-field provenance, the generated summary,
    -- and per-field applicability overrides.
    field_meta              JSONB,
    executive_summary       JSONB,
    field_dates             JSONB,

    -- Delivery-hub provenance, set when opened from the hub's Status View.
    -- `workstream` is the hub's team, which the publisher was selected from.
    workstream              TEXT,
    hub_deliverable_id      BIGINT,
    hub_deliverable_name    TEXT,
    hub_pathfinder_id       TEXT,
    hub_saved_at            TEXT,
    hub_roi_metric_id       BIGINT,

    batch_id                TEXT,
    saved_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS roi_records_natural_key
    ON roi_records (client, publisher, year);
CREATE INDEX IF NOT EXISTS roi_records_batch     ON roi_records (batch_id);
CREATE INDEX IF NOT EXISTS roi_records_seq       ON roi_records (seq);

-- The hub keeps exactly one roi_metrics row per deliverable, so at most one of
-- our records may claim a given deliverable. Without this, two records could
-- both push to the same deliverable and the second would silently overwrite the
-- first on the hub, losing it with no trace. Partial, because most records have
-- no hub link at all.
CREATE UNIQUE INDEX IF NOT EXISTS roi_records_one_per_deliverable
    ON roi_records (hub_deliverable_id) WHERE hub_deliverable_id IS NOT NULL;
"""

# ── workstream_publishers: which publishers a hub workstream may cover ────────
# The hub hands the wizard a workstream (its team). ROI is reported per
# publisher, and a workstream is usually — but not always — tied to one. This
# table is the allow-list the wizard offers, so the user picks a real publisher
# instead of typing a free-text value that won't group in the dashboards.
#
# Mappings are 1-1 today. `is_default` exists so a workstream can gain a second
# publisher later without a schema change: the default is preselected and the
# rest become alternatives in the dropdown.
WORKSTREAM_PUBLISHERS = """
CREATE TABLE IF NOT EXISTS workstream_publishers (
    workstream  TEXT NOT NULL,
    publisher   TEXT NOT NULL,
    is_default  BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (workstream, publisher)
);
CREATE INDEX IF NOT EXISTS workstream_publishers_ws ON workstream_publishers (workstream);
"""

# ── dashboards: saved Tracker/Dashboard views ─────────────────────────────────
# These used to live in browser localStorage, which made them per-browser and
# invisible to colleagues. `owner` is the SSO username that saved it.
DASHBOARDS = """
CREATE TABLE IF NOT EXISTS dashboards (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    owner       TEXT,
    owner_email TEXT,
    config      JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dashboards_owner      ON dashboards (owner);
CREATE INDEX IF NOT EXISTS dashboards_created_at ON dashboards (created_at DESC);
"""

# Order matters only in that nothing here has cross-table FKs; keep it stable
# anyway so deploy logs read the same way every time.
ALL = [
    ("files", FILES),
    ("json_documents", JSON_DOCUMENTS),
    ("roi_records", ROI_RECORDS),
    ("workstream_publishers", WORKSTREAM_PUBLISHERS),
    ("dashboards", DASHBOARDS),
]


def apply(conn) -> None:
    """Create/upgrade every table. Idempotent. Raises on the first failure so
    the caller can report which table could not be created."""
    for name, ddl in ALL:
        try:
            conn.execute(ddl)
        except Exception as e:
            raise RuntimeError(f"Could not create table '{name}': {e}") from e
