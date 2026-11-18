"""Manutenção periódica do banco: python -m app.scripts.cleanup

Apaga refresh tokens vencidos, tokens de redefinição vencidos/usados e marca como `failed` pedidos de chat
órfãos. Seguro para rodar em paralelo em várias réplicas (só uma faz o trabalho). Exemplo de agendamento em
backend/README.md (timer do systemd ou cron, a cada hora).
"""

import asyncio

from app.core.config import get_settings
from app.db.session import create_engine
from app.services.maintenance_service import run_cleanup


async def main() -> None:
    settings = get_settings()
    engine = create_engine(settings)
    try:
        report = await run_cleanup(engine, settings)
    finally:
        await engine.dispose()
    if report.skipped:
        print("Outra execução da limpeza está em andamento; nada a fazer.")
        return
    print(
        f"Limpeza concluída: {report.refresh_tokens} refresh tokens, {report.reset_tokens} tokens de redefinição, "
        f"{report.orphan_messages} pedidos de chat órfãos marcados como falha."
    )


if __name__ == "__main__":
    asyncio.run(main())
