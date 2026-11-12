"""Erros da API no formato do contrato: { message, details? } (ver docs/API_CONTRACTS.md)."""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("patchnotes.errors")

INVALID_PAYLOAD_MESSAGE = "Dados inválidos. Revise os campos e tente novamente."
UNAUTHORIZED_MESSAGE = "Sessão inválida ou expirada. Entre novamente."
SERVER_ERROR_MESSAGE = "O servidor encontrou um erro inesperado. Tente novamente em instantes."

_HTTP_MESSAGES = {
    404: "Recurso não encontrado.",
    405: "Método não permitido.",
    413: "A requisição é grande demais.",
}


class ApiError(Exception):
    def __init__(self, status_code: int, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.details = details


def unauthorized() -> ApiError:
    return ApiError(401, UNAUTHORIZED_MESSAGE)


def error_body(message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"message": message}
    if details is not None:
        body["details"] = details
    return body


def flatten_validation_errors(errors: list[Any]) -> dict[str, Any]:
    """Converte erros do Pydantic no formato { formErrors, fieldErrors } usado pelo frontend."""
    form_errors: list[str] = []
    field_errors: dict[str, list[str]] = {}
    for error in errors:
        location = [str(part) for part in error.get("loc", ()) if part not in ("body", "query", "path")]
        message = str(error.get("msg", "Valor inválido"))
        if error.get("type") == "json_invalid":
            form_errors.append("JSON malformado.")
        elif location:
            field_errors.setdefault(location[0], []).append(message)
        else:
            form_errors.append(message)
    return {"formErrors": form_errors, "fieldErrors": field_errors}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def handle_api_error(_: Request, error: ApiError) -> JSONResponse:
        return JSONResponse(error_body(error.message, error.details), status_code=error.status_code)

    @app.exception_handler(RequestValidationError)
    async def handle_validation(_: Request, error: RequestValidationError) -> JSONResponse:
        return JSONResponse(error_body(INVALID_PAYLOAD_MESSAGE, flatten_validation_errors(list(error.errors()))), status_code=400)

    @app.exception_handler(StarletteHTTPException)
    async def handle_http(_: Request, error: StarletteHTTPException) -> JSONResponse:
        message = _HTTP_MESSAGES.get(error.status_code, SERVER_ERROR_MESSAGE if error.status_code >= 500 else "Requisição inválida.")
        return JSONResponse(error_body(message), status_code=error.status_code)

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, error: Exception) -> JSONResponse:
        # Só o tipo e a rota vão para o log; nunca corpo da requisição, cabeçalhos ou tokens.
        logger.error("Erro inesperado em %s %s: %s", request.method, request.url.path, type(error).__name__, exc_info=error)
        return JSONResponse(error_body(SERVER_ERROR_MESSAGE), status_code=500)
