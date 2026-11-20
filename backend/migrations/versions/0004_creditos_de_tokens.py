"""créditos de tokens (recarga simulada)

Cada recarga soma tokens à cota do mês corrente. O saldo passa a ser: cota mensal + créditos do mês - consumo do mês.

Revision ID: 0004
Revises: 0003
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "token_credits",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("amount > 0", name=op.f("ck_token_credits_amount_positive")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_token_credits_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_token_credits")),
    )
    op.create_index("ix_token_credits_user_created", "token_credits", ["user_id", "created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_token_credits_user_created", table_name="token_credits")
    op.drop_table("token_credits")
