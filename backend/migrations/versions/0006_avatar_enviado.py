"""foto de perfil enviada como arquivo

A foto deixa de ser uma URL externa (que expunha o IP de quem via a imagem e obrigava a CSP a aceitar imagens
de qualquer site). URLs externas antigas são apagadas; quem tinha uma envia a foto de novo.

Revision ID: 0006
Revises: 0005
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_avatars",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("content_type", sa.String(length=32), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_user_avatars_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_user_avatars")),
    )
    op.execute("UPDATE users SET avatar_url = NULL WHERE avatar_url IS NOT NULL AND avatar_url NOT LIKE '/api/profile/avatar%'")


def downgrade() -> None:
    op.drop_table("user_avatars")
