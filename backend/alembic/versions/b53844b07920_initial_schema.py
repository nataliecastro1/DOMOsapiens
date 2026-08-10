"""initial_schema

Revision ID: b53844b07920
Revises: 
Create Date: 2026-08-06 18:27:11.579664

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b53844b07920'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("""
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
ALTER TABLE files ADD COLUMN IF NOT EXISTS uploaded_by       TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS uploaded_by_email TEXT;
    """)

    op.execute("""
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
    """)

    op.execute("""
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

    field_meta              JSONB,
    executive_summary       JSONB,
    field_dates             JSONB,

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
CREATE UNIQUE INDEX IF NOT EXISTS roi_records_one_per_deliverable
    ON roi_records (hub_deliverable_id) WHERE hub_deliverable_id IS NOT NULL;
    """)

    op.execute("""
CREATE TABLE IF NOT EXISTS workstream_publishers (
    workstream  TEXT NOT NULL,
    publisher   TEXT NOT NULL,
    is_default  BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (workstream, publisher)
);
CREATE INDEX IF NOT EXISTS workstream_publishers_ws ON workstream_publishers (workstream);
    """)

    op.execute("""
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
    """)

def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP TABLE IF EXISTS dashboards;")
    op.execute("DROP TABLE IF EXISTS workstream_publishers;")
    op.execute("DROP TABLE IF EXISTS roi_records;")
    op.execute("DROP TABLE IF EXISTS json_documents;")
    op.execute("DROP TABLE IF EXISTS files;")
