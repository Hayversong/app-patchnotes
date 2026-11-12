"""Fábrica da aplicação. Rodar com: uvicorn app.main:create_app --factory"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis

from app.core.config import Settings, get_settings
from app.core.errors import register_error_handlers
from app.core.middleware import BodySizeLimitMiddleware
from app.core.rate_limit import MemoryRateLimiter, RateLimiter, RedisRateLimiter
from app.db.session import create_engine, create_sessionmaker
from app.routers import auth, chat, dashboard, devlog, profile, ws_chat
from app.services.chat_service import ChatService
from app.services.email_service import Mailer, SmtpMailer
from app.services.llm_service import LLMService, OllamaService


def create_app(
    settings: Settings | None = None, *, llm: LLMService | None = None, mailer: Mailer | None = None,
    rate_limiter: RateLimiter | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = create_engine(settings)
        app.state.engine = engine
        app.state.sessionmaker = create_sessionmaker(engine)
        app.state.llm = llm or OllamaService(settings)
        app.state.mailer = mailer or SmtpMailer(settings)
        app.state.chat_service = ChatService(app.state.sessionmaker, app.state.llm, settings)
        redis = Redis.from_url(settings.redis_url, socket_timeout=2, socket_connect_timeout=2) if settings.redis_url else None
        app.state.redis = redis
        app.state.rate_limiter = rate_limiter or (RedisRateLimiter(redis) if redis else MemoryRateLimiter())
        try:
            yield
        finally:
            await app.state.rate_limiter.aclose()
            if redis is not None:
                await redis.aclose()
            await app.state.llm.aclose()
            await engine.dispose()

    app = FastAPI(
        title="Patchnotes API",
        version="2.0.0",
        lifespan=lifespan,
        # Documentação interativa só fora de produção.
        docs_url=None if settings.is_production else "/api/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/api/openapi.json",
    )
    app.state.settings = settings

    app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_request_body_bytes)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
    register_error_handlers(app)

    api = APIRouter(prefix="/api")
    for module in (auth, profile, devlog, chat, dashboard):
        api.include_router(module.router)
    app.include_router(api)
    app.include_router(ws_chat.router)
    return app
