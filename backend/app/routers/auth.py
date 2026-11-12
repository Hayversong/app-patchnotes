from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.core.errors import ApiError, unauthorized
from app.core.rate_limit import client_ip, enforce, ensure_below, identifier_key, limit_by_ip, record
from app.routers.deps import CurrentUser, SessionDep, SettingsDep
from app.schemas.auth import (
    AuthResponse,
    CurrentUserResponse,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    ResetPasswordRequest,
    UserOut,
)
from app.services import auth_service
from app.services.email_service import send_safely

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE_PATH = "/api/auth"
FORGOT_PASSWORD_MESSAGE = "Se o e-mail estiver cadastrado, você receberá as instruções para redefinir a senha."

LOGIN_PER_IP = 20  # tentativas por minuto
LOGIN_FAILURES_PER_EMAIL_IP = 10  # falhas por 5 min
LOGIN_FAILURES_PER_EMAIL = 100  # falhas por hora, somando todos os IPs


def _set_refresh_cookie(response: Response, settings: Settings, raw_token: str) -> None:
    response.set_cookie(
        settings.refresh_cookie_name, raw_token,
        max_age=settings.refresh_token_ttl_days * 86400,
        httponly=True, secure=settings.cookie_secure, samesite="strict", path=REFRESH_COOKIE_PATH,
    )


def _clear_refresh_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(settings.refresh_cookie_name, path=REFRESH_COOKIE_PATH, httponly=True, secure=settings.cookie_secure, samesite="strict")


def _check_origin(request: Request, settings: Settings) -> None:
    """Defesa extra contra CSRF nas rotas que usam o cookie (além de SameSite=Strict)."""
    origin = request.headers.get("origin")
    if origin is not None and origin.rstrip("/") not in settings.cors_origins:
        raise ApiError(403, "Origem não autorizada.")


def _auth_response(response: Response, settings: Settings, issued: auth_service.IssuedSession) -> AuthResponse:
    _set_refresh_cookie(response, settings, issued.refresh_token)
    return AuthResponse(user=UserOut.model_validate(issued.user, from_attributes=True), token=issued.access_token)


@router.post("/login", response_model=AuthResponse, response_model_exclude_none=True)
async def login(body: LoginRequest, request: Request, response: Response, session: SessionDep, settings: SettingsDep) -> AuthResponse:
    ip = client_ip(request)
    email = identifier_key(body.email)
    await enforce(request, "login-ip", ip, limit=LOGIN_PER_IP, window_seconds=60)
    # Contam só FALHAS e por (e-mail, IP): um terceiro não bloqueia o login da vítima a partir do IP dela.
    # O teto por e-mail (alto) segura força bruta distribuída sem virar um botão de bloqueio fácil.
    await ensure_below(request, "login-fail", f"{email}:{ip}", limit=LOGIN_FAILURES_PER_EMAIL_IP, window_seconds=300)
    await ensure_below(request, "login-fail-email", email, limit=LOGIN_FAILURES_PER_EMAIL, window_seconds=3600)
    try:
        issued = await auth_service.login(session, settings, email=body.email, password=body.password)
    except ApiError as error:
        if error.status_code == 401:
            await record(request, "login-fail", f"{email}:{ip}", window_seconds=300)
            await record(request, "login-fail-email", email, window_seconds=3600)
        raise
    return _auth_response(response, settings, issued)


@router.post("/register", response_model=AuthResponse, response_model_exclude_none=True, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(limit_by_ip("register", limit=10, window_seconds=3600))])
async def register(body: RegisterRequest, response: Response, session: SessionDep, settings: SettingsDep) -> AuthResponse:
    issued = await auth_service.register(session, settings, name=body.name, email=body.email, password=body.password)
    return _auth_response(response, settings, issued)


@router.get("/me", response_model=CurrentUserResponse, response_model_exclude_none=True)
async def me(user: CurrentUser) -> CurrentUserResponse:
    return CurrentUserResponse(user=UserOut.model_validate(user, from_attributes=True))


# --- Parte 2: adições aprovadas (ver docs/API_CONTRACTS.md) ---

@router.post("/refresh", response_model=AuthResponse, response_model_exclude_none=True,
             dependencies=[Depends(limit_by_ip("refresh", limit=30, window_seconds=60))])
async def refresh(request: Request, response: Response, settings: SettingsDep) -> AuthResponse:
    _check_origin(request, settings)
    sessionmaker: async_sessionmaker[AsyncSession] = request.app.state.sessionmaker
    issued: auth_service.IssuedSession | None = None
    async with sessionmaker() as session, session.begin():
        try:
            issued = await auth_service.refresh(session, settings, request.cookies.get(settings.refresh_cookie_name))
        except auth_service.RefreshReuseDetected:
            issued = None  # a revogação da família é gravada no commit deste bloco
    if issued is None:
        raise unauthorized()
    return _auth_response(response, settings, issued)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, session: SessionDep, settings: SettingsDep) -> Response:
    _check_origin(request, settings)
    await auth_service.logout(session, request.cookies.get(settings.refresh_cookie_name))
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_refresh_cookie(response, settings)
    return response


@router.post("/forgot-password", response_model=MessageResponse, status_code=status.HTTP_202_ACCEPTED,
             dependencies=[Depends(limit_by_ip("forgot", limit=5, window_seconds=900))])
async def forgot_password(body: ForgotPasswordRequest, request: Request, background: BackgroundTasks, session: SessionDep, settings: SettingsDep) -> MessageResponse:
    # Por (e-mail, IP) e um teto por e-mail: impede inundar a caixa da vítima sem deixar um terceiro esgotar a cota dela.
    email = identifier_key(body.email)
    await enforce(request, "forgot-email-ip", f"{email}:{client_ip(request)}", limit=3, window_seconds=900)
    await enforce(request, "forgot-email", email, limit=10, window_seconds=3600)
    result = await auth_service.request_password_reset(session, settings, body.email)
    if result is not None:
        user, raw_token = result
        # Enviado depois da resposta: o tempo de resposta não revela se o e-mail existe.
        background.add_task(send_safely, request.app.state.mailer, to=user.email, subject="Redefinição de senha — Patchnotes",
                            body=auth_service.reset_email_body(settings, user.name, raw_token))
    return MessageResponse(message=FORGOT_PASSWORD_MESSAGE)


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT,
             dependencies=[Depends(limit_by_ip("reset", limit=10, window_seconds=900))])
async def reset_password(body: ResetPasswordRequest, session: SessionDep) -> Response:
    await auth_service.reset_password(session, token=body.token, password=body.password)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
