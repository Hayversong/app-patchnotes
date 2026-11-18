"""Rotina de manutenção do banco: python -m app.scripts.cleanup (agendar com cron ou timer do systemd).

- Lotes pequenos, cada um na própria transação curta: não segura locks nem bloqueia cadastro/login/recuperação.
- Advisory lock do PostgreSQL: com várias réplicas agendando a rotina, só uma execução por vez faz o trabalho.
"""

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.repositories import maintenance

# Chave arbitrária e fixa do advisory lock desta rotina.
CLEANUP_LOCK_KEY = 0x7061_7463_686E_6F74 & 0x7FFF_FFFF_FFFF_FFFF  # "patchnot"
# Folga depois do vencimento antes de apagar (evita apagar algo no exato limite de uso).
GRACE = timedelta(days=1)


@dataclass
class CleanupReport:
    refresh_tokens: int = 0
    reset_tokens: int = 0
    orphan_messages: int = 0
    skipped: bool = False  # outra execução segurava o lock


async def _drain(sessionmaker: async_sessionmaker[AsyncSession], step: Callable[[AsyncSession], Awaitable[int]], batch: int, pause: float) -> int:
    total = 0
    while True:
        async with sessionmaker() as session, session.begin():
            done = await step(session)
        total += done
        if done < batch:
            return total
        await asyncio.sleep(pause)  # cede espaço para o tráfego normal entre lotes


async def run_cleanup(
    engine: AsyncEngine, settings: Settings, *, batch: int = 1000, pause: float = 0.05, now: datetime | None = None
) -> CleanupReport:
    now = now or datetime.now(UTC)
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
    report = CleanupReport()
    async with engine.connect() as lock_connection:
        locked = await lock_connection.scalar(text("SELECT pg_try_advisory_lock(:key)"), {"key": CLEANUP_LOCK_KEY})
        await lock_connection.commit()
        if not locked:
            report.skipped = True
            return report
        try:
            cutoff = now - GRACE
            # Pedido de chat parado além do tempo máximo de geração: o processo que o atendia não existe mais.
            pending_cutoff = now - timedelta(seconds=settings.ollama_total_timeout) - timedelta(minutes=5)
            report.refresh_tokens = await _drain(sessionmaker, lambda s: maintenance.delete_expired_refresh_tokens(s, cutoff, batch), batch, pause)
            report.reset_tokens = await _drain(sessionmaker, lambda s: maintenance.delete_stale_reset_tokens(s, cutoff, batch), batch, pause)
            report.orphan_messages = await _drain(sessionmaker, lambda s: maintenance.fail_orphan_pending_messages(s, pending_cutoff, batch), batch, pause)
        finally:
            await lock_connection.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": CLEANUP_LOCK_KEY})
            await lock_connection.commit()
    return report
