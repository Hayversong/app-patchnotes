"""Dados fictícios para desenvolvimento: python -m app.scripts.seed

Cria (se ainda não existir) a conta dev@patchnotes.dev / patchnotes123 com algumas entradas de devlog.
Recusa rodar com ENVIRONMENT=production.
"""

import asyncio
from datetime import UTC, datetime, timedelta

from app.core.config import get_settings
from app.core.security import hash_password
from app.db.session import create_engine, create_sessionmaker
from app.models import DevlogEntry
from app.repositories import users as user_repo

EMAIL = "dev@patchnotes.dev"
PASSWORD = "patchnotes123"
ENTRIES = [
    ("Movimentação do jogador", "Aceleração gradual e correção de colisão em rampas.", ["player", "física"], 3),
    ("Protótipo de combate", "Ajuste no tempo de recuperação dos ataques e no feedback de impacto.", ["combate", "gameplay"], 2),
    ("Menu inicial", "Navegação por teclado e controle no menu principal.", ["UI"], 1),
]


async def main() -> None:
    settings = get_settings()
    if settings.is_production:
        raise SystemExit("Seed de desenvolvimento não roda em production.")
    engine = create_engine(settings)
    try:
        async with create_sessionmaker(engine)() as session, session.begin():
            if await user_repo.get_by_email(session, EMAIL):
                print(f"{EMAIL} já existe; nada a fazer.")
                return
            user = await user_repo.create(session, name="Dev Fictício", email=EMAIL, password_hash=hash_password(PASSWORD))
            now = datetime.now(UTC)
            for title, content, tags, days_ago in ENTRIES:
                session.add(DevlogEntry(user_id=user.id, title=title, content=content, tags=tags, created_at=now - timedelta(days=days_ago)))
        print(f"Conta fictícia criada: {EMAIL} / {PASSWORD}")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
