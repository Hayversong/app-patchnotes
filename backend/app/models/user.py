import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, LargeBinary, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, utcnow


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100))
    # Sempre minúsculo: a unicidade é case-insensitive.
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    bio: Mapped[str | None] = mapped_column(String(240))
    avatar_url: Mapped[str | None] = mapped_column(Text)
    github_url: Mapped[str | None] = mapped_column(Text)
    # Versão de sessão gravada no JWT (claim "sv"). Incrementar recusa na hora todos os access tokens já emitidos
    # (redefinição de senha). Inteiro, sem a janela de 1 s de uma comparação por horário.
    session_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class RefreshToken(Base):
    """Refresh tokens opacos guardados como SHA-256. Cada login abre uma família; a rotação encadeia a família."""

    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    family_id: Mapped[uuid.UUID] = mapped_column(index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    replaced_by_id: Mapped[uuid.UUID | None] = mapped_column()

    __table_args__ = (Index("ix_refresh_tokens_expires_at", "expires_at"),)


class PasswordResetToken(Base):
    """Token de uso único (SHA-256 no banco) com validade limitada."""

    __tablename__ = "password_reset_tokens"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index("ix_password_reset_tokens_expires_at", "expires_at"),
        Index("ix_password_reset_tokens_used_at", "used_at", postgresql_where=text("used_at IS NOT NULL")),
    )


class PendingRegistration(Base):
    """Cadastro aguardando a confirmação do e-mail. A conta (users) só nasce quando o link é aberto.

    O hash da senha fica aqui, e não numa conta inativa: um terceiro que cadastre o e-mail de outra pessoa
    nunca cria uma conta com a senha dele; no máximo dispara um e-mail que a dona do endereço ignora.
    Um novo pedido para o mesmo e-mail substitui o anterior (e invalida o link antigo).
    """

    __tablename__ = "pending_registrations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(255))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (Index("ix_pending_registrations_expires_at", "expires_at"),)


class UserAvatar(Base):
    """Foto de perfil enviada pela pessoa. Fica numa tabela à parte para o binário não vir junto em cada
    consulta de usuário. users.avatar_url aponta para /api/profile/avatar?v=<versão>."""

    __tablename__ = "user_avatars"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    content_type: Mapped[str] = mapped_column(String(32))
    data: Mapped[bytes] = mapped_column(LargeBinary)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
