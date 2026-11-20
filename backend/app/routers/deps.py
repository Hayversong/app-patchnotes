from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.core.errors import unauthorized
from app.core.origin import SAFE_METHODS, ensure_trusted_origin
from app.db.session import get_session
from app.models import User
from app.services import auth_service
from app.services.chat_service import ChatService

# scope="function": o commit acontece ANTES de a resposta ser enviada (falha de commit vira erro, nunca 2xx).
SessionDep = Annotated[AsyncSession, Depends(get_session, scope="function")]


def get_settings_dep(request: Request) -> Settings:
    return request.app.state.settings


SettingsDep = Annotated[Settings, Depends(get_settings_dep)]


def access_token(request: Request, settings: Settings) -> str:
    """Token do header Authorization (Swagger, scripts) ou do cookie HttpOnly (navegador).
    Pelo cookie, escritas exigem origem confiável: o navegador anexa o cookie sozinho, então é ali que mora o CSRF."""
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() == "bearer" and token.strip():
        return token.strip()
    cookie = request.cookies.get(settings.access_cookie_name, "").strip()
    if not cookie:
        raise unauthorized()
    if request.method not in SAFE_METHODS:
        ensure_trusted_origin(request, settings)
    return cookie


async def get_current_user(request: Request, settings: SettingsDep) -> User:
    """Autenticação em sessão própria e curta, para servir também rotas que não seguram sessão (chat)."""
    token = access_token(request, settings)
    sessionmaker: async_sessionmaker[AsyncSession] = request.app.state.sessionmaker
    async with sessionmaker() as session:
        user, _ = await auth_service.authenticate_access_token(session, settings, token)
        return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_chat_service(request: Request) -> ChatService:
    return request.app.state.chat_service


ChatServiceDep = Annotated[ChatService, Depends(get_chat_service)]
