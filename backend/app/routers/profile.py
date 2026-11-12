from fastapi import APIRouter

from app.routers.deps import CurrentUser, SessionDep
from app.schemas.profile import ProfileOut, ProfileResponse, UpdateProfileRequest
from app.services import profile_service

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=ProfileResponse, response_model_exclude_none=True)
async def get_profile(user: CurrentUser) -> ProfileResponse:
    return ProfileResponse(user=ProfileOut.model_validate(user, from_attributes=True))


@router.patch("", response_model=ProfileResponse, response_model_exclude_none=True)
async def update_profile(body: UpdateProfileRequest, user: CurrentUser, session: SessionDep) -> ProfileResponse:
    updated = await profile_service.update_profile(session, user.id, body)
    return ProfileResponse(user=ProfileOut.model_validate(updated, from_attributes=True))
