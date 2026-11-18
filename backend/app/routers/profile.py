from fastapi import APIRouter, Request, Response

from app.core.errors import ApiError
from app.core.rate_limit import enforce

from app.routers.deps import CurrentUser, SessionDep, SettingsDep
from app.schemas.profile import ProfileOut, ProfileResponse, UpdateProfileRequest
from app.services import avatar_service, profile_service

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=ProfileResponse, response_model_exclude_none=True)
async def get_profile(user: CurrentUser) -> ProfileResponse:
    return ProfileResponse(user=ProfileOut.model_validate(user, from_attributes=True))


PROFILE_WRITES_PER_MINUTE = 20


@router.patch("", response_model=ProfileResponse, response_model_exclude_none=True)
async def update_profile(body: UpdateProfileRequest, request: Request, user: CurrentUser, session: SessionDep) -> ProfileResponse:
    await enforce(request, "profile-write", str(user.id), limit=PROFILE_WRITES_PER_MINUTE, window_seconds=60)
    updated = await profile_service.update_profile(session, user.id, body)
    return ProfileResponse(user=ProfileOut.model_validate(updated, from_attributes=True))


@router.put("/avatar", response_model=ProfileResponse, response_model_exclude_none=True, summary="Envia a foto de perfil (corpo = bytes da imagem)",
            openapi_extra={"requestBody": {"required": True, "content": {mime: {"schema": {"type": "string", "format": "binary"}} for mime in ("image/png", "image/jpeg", "image/webp")}}})
async def upload_avatar(request: Request, user: CurrentUser, session: SessionDep, settings: SettingsDep) -> ProfileResponse:
    await enforce(request, "profile-write", str(user.id), limit=PROFILE_WRITES_PER_MINUTE, window_seconds=60)
    updated = await avatar_service.save_avatar(session, user.id, await request.body(), settings.avatar_max_bytes)
    return ProfileResponse(user=ProfileOut.model_validate(updated, from_attributes=True))


@router.delete("/avatar", response_model=ProfileResponse, response_model_exclude_none=True, summary="Remove a foto de perfil")
async def delete_avatar(request: Request, user: CurrentUser, session: SessionDep) -> ProfileResponse:
    await enforce(request, "profile-write", str(user.id), limit=PROFILE_WRITES_PER_MINUTE, window_seconds=60)
    updated = await avatar_service.delete_avatar(session, user.id)
    return ProfileResponse(user=ProfileOut.model_validate(updated, from_attributes=True))


@router.get("/avatar", summary="Foto de perfil de quem está logado", response_class=Response,
            responses={200: {"content": {"image/png": {}, "image/jpeg": {}, "image/webp": {}}}, 404: {}})
async def get_avatar(user: CurrentUser, session: SessionDep) -> Response:
    avatar = await avatar_service.get_avatar(session, user.id)
    if avatar is None:
        raise ApiError(404, "Nenhuma foto de perfil.")
    return Response(content=avatar.data, media_type=avatar.content_type, headers={
        # A URL muda a cada envio (?v=...): pode ficar no cache do navegador, nunca em cache compartilhado.
        "Cache-Control": "private, max-age=86400",
        "Content-Disposition": 'inline; filename="avatar"',
    })
