"""add_extraction_jobs

Revision ID: ecd1906813d9
Revises: 30ead592e520
Create Date: 2026-08-07 18:18:57.009091

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ecd1906813d9'
down_revision: Union[str, Sequence[str], None] = '30ead592e520'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("""
CREATE TABLE IF NOT EXISTS extraction_jobs (
    job_id          TEXT PRIMARY KEY,
    status          TEXT NOT NULL,
    file_path       TEXT,
    result_data     JSONB,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
    """)

def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP TABLE IF EXISTS extraction_jobs;")
