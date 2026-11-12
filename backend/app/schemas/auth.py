import uuid

from pydantic import EmailStr, Field, field_validator

from app.schemas.common import ApiModel

PasswordStr = Field(min_length=8, max_length=128)


def _lower(value: str) -> str:
    return value.strip().lower()


class LoginRequest(ApiModel):
    email: EmailStr = Field(max_length=254)
    password: str = PasswordStr

    _normalize = field_validator("email")(classmethod(lambda cls, value: _lower(value)))


class RegisterRequest(ApiModel):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr = Field(max_length=254)
    password: str = PasswordStr

    _normalize = field_validator("email")(classmethod(lambda cls, value: _lower(value)))


class UserOut(ApiModel):
    id: uuid.UUID
    name: str
    email: str
    avatar_url: str | None = None


class AuthResponse(ApiModel):
    user: UserOut
    token: str


class CurrentUserResponse(ApiModel):
    user: UserOut


class ForgotPasswordRequest(ApiModel):
    email: EmailStr = Field(max_length=254)

    _normalize = field_validator("email")(classmethod(lambda cls, value: _lower(value)))


class ResetPasswordRequest(ApiModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = PasswordStr


class MessageResponse(ApiModel):
    message: str
