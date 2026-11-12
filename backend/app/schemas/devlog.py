import uuid
from typing import Annotated

from pydantic import Field, StringConstraints

from app.schemas.common import ApiModel, UtcDateTime

Tag = Annotated[str, StringConstraints(min_length=1, max_length=40)]


class DevlogEntryOut(ApiModel):
    id: uuid.UUID
    title: str
    content: str
    tags: list[str]
    created_at: UtcDateTime


class DevlogEntriesResponse(ApiModel):
    entries: list[DevlogEntryOut]


class CreateDevlogRequest(ApiModel):
    title: str = Field(min_length=3, max_length=200)
    content: str = Field(min_length=10, max_length=20_000)
    tags: list[Tag] | None = Field(default=None, max_length=20)


class CreateDevlogResponse(ApiModel):
    entry: DevlogEntryOut
