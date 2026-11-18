from datetime import UTC, datetime
from typing import Annotated
from urllib.parse import urlparse

from pydantic import AfterValidator, BaseModel, ConfigDict, PlainSerializer
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    """Modelos da API usam camelCase no JSON (contrato da Parte 1) e ignoram campos extras."""

    model_config = ConfigDict(alias_generator=to_camel, validate_by_name=True, validate_by_alias=True, serialize_by_alias=True, extra="ignore")


def _iso_utc(value: datetime) -> str:
    """Mesmo formato do `Date.toISOString()` do frontend: 2026-09-17T18:30:00.000Z."""
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


UtcDateTime = Annotated[datetime, PlainSerializer(_iso_utc, return_type=str)]


def _http_url_or_empty(value: str) -> str:
    if value == "":
        return value
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("Informe uma URL http(s) válida")
    return value


OptionalHttpUrl = Annotated[str, AfterValidator(_http_url_or_empty)]
