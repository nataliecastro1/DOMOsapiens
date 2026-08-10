"""drop_year_client

Revision ID: 5ba66ff31958
Revises: b53844b07920
Create Date: 2026-08-07 12:06:25.360783

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5ba66ff31958'
down_revision: Union[str, Sequence[str], None] = 'b53844b07920'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("DROP INDEX IF EXISTS roi_records_natural_key;")
    op.execute("ALTER TABLE roi_records DROP COLUMN IF EXISTS year;")
    op.execute("ALTER TABLE roi_records DROP COLUMN IF EXISTS client;")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("ALTER TABLE roi_records ADD COLUMN IF NOT EXISTS client TEXT;")
    op.execute("ALTER TABLE roi_records ADD COLUMN IF NOT EXISTS year INTEGER;")
    op.execute("CREATE INDEX IF NOT EXISTS roi_records_natural_key ON roi_records (client, publisher, year);")
