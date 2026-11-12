from fastapi import APIRouter, Request

from app.core.rate_limit import enforce

from app.routers.deps import CurrentUser, SessionDep
from app.schemas.profile import ProfileOut, ProfileResponse, UpdateProfileRequest
from app.services import profile_service

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
