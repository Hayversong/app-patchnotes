import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.concurrency import run_in_threadpool

from app.core.config import Settings
from app.core.errors import ApiError, unauthorized
from app.core.security import (
    InvalidTokenError,
    create_access_token,
    decode_access_token,
    hash_opaque_token,
    hash_password,
    new_opaque_token,
    password_needs_rehash,
    verify_password,
)
from app.models import User
from app.repositories import tokens as token_repo
from app.repositories import users as user_repo
from app.services.email_service import Mailer, send_safely

INVALID_CREDENTIALS = "E-mail ou senha inválidos"
EMAIL_TAKEN = "Este e-mail já está cadastrado"
INVALID_RESET_TOKEN = "Link de redefinição inválido ou expirado. Solicite um novo."
RESET_EMAIL_SUBJECT = "Redefinição de senha — Patchnotes"

logger = logging.getLogger("patchnotes.auth")


@dataclass(frozen=True)
class IssuedSession:
    user: User
    access_token: str
    refresh_token: str


def _now() -> datetime:
    return datetime.now(UTC)


async def _issue(session: AsyncSession, settings: Settings, user: User, family_id: uuid.UUID | None = None) -> tuple[IssuedSession, uuid.UUID]:
    raw_refresh = new_opaque_token()
    stored = await token_repo.add_refresh_token(
        session,
        user_id=user.id,
        family_id=family_id or uuid.uuid4(),
        token_hash=hash_opaque_token(raw_refresh),
        expires_at=_now() + timedelta(days=settings.refresh_token_ttl_days),
    )
    return IssuedSession(user, create_access_token(user.id, user.session_version, settings), raw_refresh), stored.id


async def register(session: AsyncSession, settings: Settings, *, name: str, email: str, password: str) -> IssuedSession:
    if await user_repo.get_by_email(session, email):
        raise ApiError(409, EMAIL_TAKEN)
    password_hash = await run_in_threadpool(hash_password, password)
    try:
        async with session.begin_nested():
            user = await user_repo.create(session, name=name, email=email, password_hash=password_hash)
    except IntegrityError as error:  # cadastro simultâneo com o mesmo e-mail
        raise ApiError(409, EMAIL_TAKEN) from error
    issued, _ = await _issue(session, settings, user)
    return issued


async def login(session: AsyncSession, settings: Settings, *, email: str, password: str) -> IssuedSession:
    user = await user_repo.get_by_email(session, email)
    # verify_password roda mesmo sem usuário (hash fictício) para não revelar quais e-mails existem pelo tempo de resposta.
    valid = await run_in_threadpool(verify_password, user.password_hash if user else None, password)
    if user is None or not valid:
        raise ApiError(401, INVALID_CREDENTIALS)
    if password_needs_rehash(user.password_hash):
        user.password_hash = await run_in_threadpool(hash_password, password)
    issued, _ = await _issue(session, settings, user)
    return issued


async def refresh(session: AsyncSession, settings: Settings, raw_token: str | None) -> IssuedSession:
    """Rotação: o refresh usado é revogado e substituído. Reuso de um token já revogado revoga a família inteira."""
    if not raw_token:
        raise unauthorized()
    now = _now()
    stored = await token_repo.find_refresh_token(session, hash_opaque_token(raw_token))
    if stored is None:
        raise unauthorized()
    if stored.revoked_at is not None:
        await token_repo.revoke_family(session, stored.family_id, now)
        raise RefreshReuseDetected
    if not await token_repo.claim_refresh_token(session, stored.id, now):
        raise unauthorized()
    user = await user_repo.get_by_id(session, stored.user_id)
    if user is None:
        raise unauthorized()
    issued, new_id = await _issue(session, settings, user, stored.family_id)
    await token_repo.link_replacement(session, stored.id, new_id)
    return issued


class RefreshReuseDetected(Exception):
    """Refresh já revogado foi reapresentado (possível roubo). A família foi revogada nesta transação:
    quem chama deve fazer commit e só então responder 401."""


async def logout(session: AsyncSession, raw_token: str | None) -> None:
    if not raw_token:
        return
    stored = await token_repo.find_refresh_token(session, hash_opaque_token(raw_token))
    if stored is not None:
        await token_repo.revoke_family(session, stored.family_id, _now())


async def authenticate_access_token(session: AsyncSession, settings: Settings, token: str) -> tuple[User, datetime]:
    """Valida o JWT e o usuário. Retorna o usuário e a expiração do token."""
    try:
        claims = decode_access_token(token, settings)
    except InvalidTokenError as error:
        raise unauthorized() from error
    user = await user_repo.get_by_id(session, claims.user_id)
    if user is None:
        raise unauthorized()
    if claims.session_version != user.session_version:  # senha redefinida depois da emissão
        raise unauthorized()
    return user, claims.expires_at


async def request_password_reset(session: AsyncSession, settings: Settings, email: str) -> tuple[User, str] | None:
    """Gera um token de uso único. Retorna None (sem erro) quando o e-mail não existe, para não revelar cadastros."""
    user = await user_repo.get_by_email(session, email)
    if user is None:
        return None
    now = _now()
    await token_repo.invalidate_reset_tokens(session, user.id, now)
    raw = new_opaque_token()
    await token_repo.add_reset_token(
        session, user_id=user.id, token_hash=hash_opaque_token(raw), expires_at=now + timedelta(minutes=settings.password_reset_ttl_minutes)
    )
    return user, raw


async def reset_password(session: AsyncSession, *, token: str, password: str) -> None:
    now = _now()
    user_id = await token_repo.consume_reset_token(session, hash_opaque_token(token), now)
    if user_id is None:
        raise ApiError(400, INVALID_RESET_TOKEN)
    password_hash = await run_in_threadpool(hash_password, password)
    # Encerra todas as sessões: refresh tokens revogados e access tokens anteriores recusados.
    await user_repo.set_password(session, user_id, password_hash)
    await token_repo.revoke_all_for_user(session, user_id, now)


async def process_password_reset_request(
    sessionmaker: async_sessionmaker[AsyncSession], mailer: Mailer, settings: Settings, email: str
) -> None:
    """Executada DEPOIS da resposta 202: consulta, escrita e e-mail não influenciam o tempo de resposta,
    então ele não revela se a conta existe. Transação curta; o e-mail sai fora dela. Falhas só vão para o log
    (sem e-mail, token ou corpo)."""
    try:
        async with sessionmaker() as session, session.begin():
            result = await request_password_reset(session, settings, email)
    except Exception as error:  # noqa: BLE001 — tarefa de fundo não pode derrubar o servidor
        logger.error("Falha ao preparar a redefinição de senha: %s", type(error).__name__)
        return
    if result is None:
        return
    user, raw_token = result
    await send_safely(mailer, to=user.email, subject=RESET_EMAIL_SUBJECT, body=reset_email_body(settings, user.name, raw_token))


def reset_email_body(settings: Settings, name: str, raw_token: str) -> str:
    link = f"{settings.frontend_url.rstrip('/')}/reset-password#token={raw_token}"
    return (
        f"Olá, {name}!\n\n"
        "Recebemos um pedido para redefinir a senha da sua conta no Patchnotes.\n"
        f"Abra o link abaixo em até {settings.password_reset_ttl_minutes} minutos (ele só pode ser usado uma vez):\n\n"
        f"{link}\n\n"
        "Se você não fez esse pedido, ignore este e-mail; sua senha continua a mesma.\n"
    )
