import uuid

from pydantic import Field

from app.schemas.common import ApiModel, OptionalHttpUrl


class ProfileOut(ApiModel):
    id: uuid.UUID
    name: str
    email: str
    avatar_url: str | None = None
    bio: str | None = None
    github_url: str | None = None


class ProfileResponse(ApiModel):
    user: ProfileOut


class UpdateProfileRequest(ApiModel):
    """Atualização parcial: só os campos enviados (e não nulos) mudam.
    A foto não entra aqui: é enviada como arquivo em PUT /profile/avatar (avatarUrl é só de leitura)."""

    name: str | None = Field(default=None, min_length=2, max_length=100)
    bio: str | None = Field(default=None, max_length=240)
    github_url: OptionalHttpUrl | None = Field(default=None, max_length=2048)
