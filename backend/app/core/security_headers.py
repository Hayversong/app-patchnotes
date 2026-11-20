"""Cabeçalhos de segurança em todas as respostas HTTP da API.

- Cache-Control: no-store — respostas da API são dados privados, e login/cadastro/refresh trazem o access token
  no corpo: nem o navegador nem um proxy no caminho podem guardar cópia.
- X-Content-Type-Options, X-Frame-Options e Referrer-Policy: defesa básica caso alguma resposta seja aberta
  direto no navegador.
- Content-Security-Policy restritiva (nada pode ser carregado nem executado): JSON nunca precisa disso.
  Fica de fora do Swagger (/docs), que carrega o Swagger UI de um CDN.
"""

from starlette.types import ASGIApp, Message, Receive, Scope, Send

_ALWAYS = [
    (b"cache-control", b"no-store"),
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"no-referrer"),
]
_API_CSP = (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'")
_DOCS_PATHS = ("/docs", "/openapi.json")


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        extra = list(_ALWAYS)
        if not scope.get("path", "").startswith(_DOCS_PATHS):
            extra.append(_API_CSP)

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                present = {name.lower() for name, _ in message.get("headers", [])}
                message["headers"] = [*message.get("headers", []), *(item for item in extra if item[0] not in present)]
            await send(message)

        await self.app(scope, receive, send_with_headers)
