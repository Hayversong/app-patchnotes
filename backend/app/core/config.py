import ipaddress
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

DEFAULT_SYSTEM_PROMPT = (
    "Você é o assistente do Patchnotes, uma ferramenta para pessoas que desenvolvem jogos. "
    "Ajude a explorar mecânicas, organizar decisões de design e transformar progresso em notas de atualização. "
    "Responda em português do Brasil, de forma objetiva e prática."
)


class Settings(BaseSettings):
    """Configuração lida de variáveis de ambiente (ou backend/.env). Ver .env.example."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"

    database_url: str
    db_pool_size: int = Field(default=10, ge=1)

    jwt_secret: SecretStr
    access_token_ttl_minutes: int = Field(default=15, ge=1)
    refresh_token_ttl_days: int = Field(default=7, ge=1)
    refresh_cookie_name: str = "patchnotes_refresh"
    cookie_secure: bool = False
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    # Proxies reversos confiáveis (IPs ou redes CIDR, separados por vírgula). Só conexões vindas deles têm o
    # X-Forwarded-For lido. Vazio = usa o IP da conexão. NÃO inclua o servidor Next.js: o rewrite dele repassa
    # o X-Forwarded-For enviado pelo cliente sem acrescentar o IP real.
    trusted_proxies: Annotated[list[str], NoDecode] = []
    # Substituído por TRUSTED_PROXIES; mantido só para recusar configurações antigas com true.
    trust_proxy_headers: bool = False
    rate_limit_enabled: bool = True
    # Estado compartilhado entre réplicas (limites de requisição e de conexões WebSocket). Obrigatório em production.
    redis_url: str | None = None
    max_request_body_bytes: int = Field(default=64 * 1024, ge=1024)

    password_reset_ttl_minutes: int = Field(default=30, ge=5, le=24 * 60)
    frontend_url: str = "http://localhost:3000"
    smtp_host: str = "127.0.0.1"
    smtp_port: int = 1025
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_starttls: bool = False
    smtp_use_tls: bool = False
    smtp_timeout_seconds: float = 10
    mail_from: str = "Patchnotes <no-reply@patchnotes.local>"

    ollama_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen2.5:3b"
    ollama_temperature: float = Field(default=0.7, ge=0, le=2)
    ollama_num_ctx: int = Field(default=2048, ge=512)
    ollama_max_output_tokens: int = Field(default=512, ge=16)
    ollama_connect_timeout: float = Field(default=5, gt=0)
    ollama_read_timeout: float = Field(default=60, gt=0)
    ollama_total_timeout: float = Field(default=180, gt=0)
    ollama_keep_alive: str = "5m"

    chat_system_prompt: str = DEFAULT_SYSTEM_PROMPT
    chat_context_messages: int = Field(default=6, ge=0, le=50)
    chat_history_max: int = Field(default=200, ge=1, le=1000)
    monthly_token_quota: int = Field(default=100_000, ge=0)

    ws_auth_timeout_seconds: float = Field(default=5, gt=0)
    ws_max_frame_bytes: int = Field(default=16 * 1024, ge=1024)
    # Conexões simultâneas: por conta autenticada e por IP (inclui as ainda não autenticadas).
    ws_max_connections_per_user: int = Field(default=3, ge=1)
    ws_max_connections_per_ip: int = Field(default=20, ge=1)
    # Sem mensagens do cliente por este tempo, a conexão é encerrada (o frontend reconecta no próximo envio).
    ws_idle_timeout_seconds: float = Field(default=600, gt=0)
    # Validade de cada vaga de conexão; renovada a cada ttl/3 enquanto a conexão vive (processo morto = vaga expira).
    ws_slot_ttl_seconds: float = Field(default=60, ge=1)

    @field_validator("trusted_proxies", mode="before")
    @classmethod
    def split_proxies(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("trusted_proxies")
    @classmethod
    def check_proxies(cls, value: list[str]) -> list[str]:
        for item in value:
            try:
                network = ipaddress.ip_network(item, strict=False)
            except ValueError as error:
                raise ValueError(f"TRUSTED_PROXIES: '{item}' não é um IP ou rede CIDR") from error
            if network.prefixlen == 0:
                raise ValueError("TRUSTED_PROXIES não aceita 0.0.0.0/0 nem ::/0 (confiaria em qualquer cliente)")
        return value

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip().rstrip("/") for origin in value.split(",") if origin.strip()]
        return value

    @model_validator(mode="after")
    def check_security(self) -> "Settings":
        if len(self.jwt_secret.get_secret_value()) < 32:
            raise ValueError("JWT_SECRET deve ter pelo menos 32 caracteres")
        if "*" in self.cors_origins:
            raise ValueError("CORS_ORIGINS não aceita '*'; liste as origens explicitamente")
        if self.environment == "production" and not self.cookie_secure:
            raise ValueError("COOKIE_SECURE=true é obrigatório em production")
        if self.trust_proxy_headers:
            raise ValueError("TRUST_PROXY_HEADERS foi removido: liste os proxies em TRUSTED_PROXIES (IPs ou CIDR)")
        if self.environment == "production" and not self.redis_url:
            raise ValueError("REDIS_URL é obrigatório em production (limites compartilhados entre réplicas)")
        if self.smtp_starttls and self.smtp_use_tls:
            raise ValueError("Use SMTP_STARTTLS ou SMTP_USE_TLS, não ambos")
        return self

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # valores obrigatórios vêm do ambiente
