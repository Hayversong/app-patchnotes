"""Envio de e-mail por SMTP (aiosmtplib). Em desenvolvimento, o Mailpit do docker compose recebe tudo."""

import logging
from email.message import EmailMessage
from typing import Protocol

import aiosmtplib

from app.core.config import Settings

logger = logging.getLogger("patchnotes.email")


class Mailer(Protocol):
    async def send(self, *, to: str, subject: str, body: str) -> None: ...


class SmtpMailer:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def send(self, *, to: str, subject: str, body: str) -> None:
        message = EmailMessage()
        message["From"] = self._settings.mail_from
        message["To"] = to
        message["Subject"] = subject
        message.set_content(body)
        password = self._settings.smtp_password.get_secret_value() if self._settings.smtp_password else None
        await aiosmtplib.send(
            message,
            hostname=self._settings.smtp_host,
            port=self._settings.smtp_port,
            username=self._settings.smtp_username or None,
            password=password,
            start_tls=self._settings.smtp_starttls,
            use_tls=self._settings.smtp_use_tls,
            timeout=self._settings.smtp_timeout_seconds,
        )


async def send_safely(mailer: Mailer, *, to: str, subject: str, body: str) -> None:
    """Usado em tarefa de fundo: falhas são registradas sem destinatário, corpo ou token."""
    try:
        await mailer.send(to=to, subject=subject, body=body)
    except Exception as error:  # noqa: BLE001 — tarefa de fundo não pode derrubar o servidor
        logger.error("Falha ao enviar e-mail (%s): %s", subject, type(error).__name__)
