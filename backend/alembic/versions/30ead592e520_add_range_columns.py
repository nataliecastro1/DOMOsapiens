"""add_range_columns

Revision ID: 30ead592e520
Revises: 5ba66ff31958
Create Date: 2026-08-07 12:29:27.087597

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '30ead592e520'
down_revision: Union[str, Sequence[str], None] = '5ba66ff31958'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("ALTER TABLE roi_records ADD COLUMN IF NOT EXISTS client_scope_name TEXT;")
    op.execute("ALTER TABLE roi_records ADD COLUMN IF NOT EXISTS applicable_from TEXT;")
    op.execute("ALTER TABLE roi_records ADD COLUMN IF NOT EXISTS applicable_to TEXT;")
    op.execute("ALTER TABLE roi_records ADD COLUMN IF NOT EXISTS hub_deliverable_id TEXT;")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS roi_records_hub_deliverable_id_idx ON roi_records (hub_deliverable_id) WHERE hub_deliverable_id IS NOT NULL;")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP INDEX IF EXISTS roi_records_hub_deliverable_id_idx;")
    op.execute("ALTER TABLE roi_records DROP COLUMN hub_deliverable_id;")
    op.execute("ALTER TABLE roi_records DROP COLUMN applicable_to;")
    op.execute("ALTER TABLE roi_records DROP COLUMN applicable_from;")
    op.execute("ALTER TABLE roi_records DROP COLUMN client_scope_name;")
