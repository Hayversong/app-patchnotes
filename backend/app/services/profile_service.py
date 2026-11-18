import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import unauthorized
from app.models import User
from app.repositories import users as user_repo
from app.schemas.profile import UpdateProfileRequest


async def update_profile(session: AsyncSession, user_id: uuid.UUID, data: UpdateProfileRequest) -> User:
    """Atualiza só os campos enviados. Recebe o id, nunca o objeto da autenticação: um objeto carregado
    em outra sessão pode estar desatualizado (ex.: senha redefinida no meio) e não pode ser regravado."""
    # Campos ausentes ou nulos não mudam; "" limpa URLs/bio (igual ao contrato da Parte 1).
    values = {field: value for field, value in data.model_dump(exclude_unset=True, by_alias=False).items() if value is not None}
    user = await user_repo.update_profile_fields(session, user_id, values) if values else await user_repo.get_by_id(session, user_id)
    if user is None:  # conta removida entre a autenticação e a atualização
        raise unauthorized()
    return user
