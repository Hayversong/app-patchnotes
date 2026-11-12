from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.repositories import users as user_repo
from app.schemas.profile import UpdateProfileRequest

_COLUMNS = {"name": "name", "bio": "bio", "avatar_url": "avatar_url", "github_url": "github_url"}


async def update_profile(session: AsyncSession, user: User, data: UpdateProfileRequest) -> User:
    # Campos ausentes ou nulos não mudam; "" limpa URLs/bio (igual ao contrato da Parte 1).
    values = {_COLUMNS[field]: value for field, value in data.model_dump(exclude_unset=True, by_alias=False).items() if value is not None}
    if not values:
        return user
    return await user_repo.update_fields(session, user, values)
