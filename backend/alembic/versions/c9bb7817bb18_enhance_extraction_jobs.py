"""enhance extraction_jobs

Revision ID: c9bb7817bb18
Revises: ecd1906813d9
Create Date: 2026-08-08 08:36:56.698756

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9bb7817bb18'
down_revision: Union[str, Sequence[str], None] = 'ecd1906813d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("""
        ALTER TABLE extraction_jobs 
        ADD COLUMN user_id TEXT,
        ADD COLUMN user_email TEXT,
        ADD COLUMN original_filename TEXT;
    """)

def downgrade() -> None:
    """Downgrade schema."""
    op.execute("""
        ALTER TABLE extraction_jobs 
        DROP COLUMN user_id,
        DROP COLUMN user_email,
        DROP COLUMN original_filename;
    """)
