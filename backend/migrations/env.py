import asyncio
import os

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from app.db.base import Base
from app.models import *  # noqa: F403 — registra todas as tabelas no metadata

config = context.config
target_metadata = Base.metadata


def database_url() -> str:
    # Permite `alembic -x db_url=...` (usado pelos testes); senão, DATABASE_URL do ambiente/.env.
    override = context.get_x_argument(as_dictionary=True).get("db_url")
    if override:
        return override
    if "DATABASE_URL" in os.environ:
        return os.environ["DATABASE_URL"]
    from app.core.config import get_settings

    return get_settings().database_url


def run_migrations_offline() -> None:
    context.configure(url=database_url(), target_metadata=target_metadata, literal_binds=True, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:  # type: ignore[no-untyped-def]
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    engine = create_async_engine(database_url(), hide_parameters=True)
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
