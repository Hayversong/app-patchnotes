"""Inicia a API com as opções de segurança do servidor já definidas: ``python -m app``.

Prefira este comando ao ``uvicorn`` direto:
- ``proxy_headers=False``: o uvicorn, por padrão, confia no X-Forwarded-For de conexões vindas de 127.0.0.1 e
  reescreve o IP do cliente antes da aplicação ver a conexão. Atrás do rewrite do Next.js (que repassa o
  cabeçalho do cliente sem alterar), isso deixava qualquer pessoa escolher o próprio IP e escapar dos limites.
  Quem decide em quais proxies confiar é a aplicação, pela variável TRUSTED_PROXIES.
- ``ws_max_size``: o servidor recusa frames WebSocket acima do limite antes de alocá-los na memória.

Variáveis: API_HOST (padrão 127.0.0.1), API_PORT (8000), API_WORKERS (1).
"""

import os

import uvicorn

from app.core.config import get_settings


def main() -> None:
    settings = get_settings()
    uvicorn.run(
        "app.main:create_app",
        factory=True,
        host=os.environ.get("API_HOST", "127.0.0.1"),
        port=int(os.environ.get("API_PORT", "8000")),
        workers=int(os.environ.get("API_WORKERS", "1")),
        proxy_headers=False,
        server_header=False,
        ws_max_size=settings.ws_max_frame_bytes,
    )


if __name__ == "__main__":
    main()
