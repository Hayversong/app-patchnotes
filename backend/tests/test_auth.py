import logging
import time

import jwt
import pytest

from app.core.security import hash_opaque_token
from tests.conftest import Harness, build_harness, make_settings

PASSWORD = "senha-segura-1"


def refresh_cookie(harness: Harness) -> str | None:
    return harness.client.cookies.get("patchnotes_refresh")


# --- Cadastro ---------------------------------------------------------------

def test_register_creates_user_and_returns_contract(harness: Harness) -> None:
    response = harness.client.post("/api/auth/register", json={"name": "Ada Teste", "email": "Ada@Patchnotes.DEV", "password": PASSWORD})
    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"user", "token"}
    assert set(body["user"]) == {"id", "name", "email"}  # avatarUrl ausente é omitido, nunca null
    assert body["user"]["email"] == "ada@patchnotes.dev"
    set_cookie = response.headers["set-cookie"].lower()
    assert "patchnotes_refresh=" in set_cookie and "httponly" in set_cookie and "samesite=strict" in set_cookie and "path=/api/auth" in set_cookie

    [(stored_hash,)] = harness.sql("SELECT password_hash FROM users WHERE email = 'ada@patchnotes.dev'")
    assert stored_hash.startswith("$argon2id$") and PASSWORD not in stored_hash


def test_register_duplicate_email_is_case_insensitive(harness: Harness) -> None:
    harness.register(email="dup@patchnotes.dev")
    response = harness.client.post("/api/auth/register", json={"name": "Outra", "email": "DUP@patchnotes.dev", "password": PASSWORD})
    assert response.status_code == 409
    assert response.json() == {"message": "Este e-mail já está cadastrado"}


@pytest.mark.parametrize("payload, field", [
    ({"name": "A", "email": "a@patchnotes.dev", "password": PASSWORD}, "name"),
    ({"name": "Ada", "email": "não-é-email", "password": PASSWORD}, "email"),
    ({"name": "Ada", "email": "a@patchnotes.dev", "password": "curta"}, "password"),
    ({"name": "Ada", "email": "a@patchnotes.dev", "password": "x" * 129}, "password"),
])
def test_register_validation_returns_400_with_field_errors(harness: Harness, payload: dict[str, str], field: str) -> None:
    response = harness.client.post("/api/auth/register", json=payload)
    assert response.status_code == 400
    body = response.json()
    assert body["message"] == "Dados inválidos. Revise os campos e tente novamente."
    assert field in body["details"]["fieldErrors"]


def test_malformed_json_is_400_not_500(harness: Harness) -> None:
    response = harness.client.post("/api/auth/login", content="{", headers={"Content-Type": "application/json"})
    assert response.status_code == 400
    assert response.json()["details"]["formErrors"] == ["JSON malformado."]


def test_oversized_body_is_rejected(harness: Harness) -> None:
    response = harness.client.post("/api/auth/login", content="x" * (70 * 1024), headers={"Content-Type": "application/json"})
    assert response.status_code == 413
    assert "message" in response.json()


# --- Login e sessão ---------------------------------------------------------

def test_login_success_and_wrong_credentials(harness: Harness, user: dict) -> None:
    ok = harness.client.post("/api/auth/login", json={"email": "PESSOA@patchnotes.dev", "password": PASSWORD})
    assert ok.status_code == 200
    assert ok.json()["user"]["id"] == user["user"]["id"]

    wrong = harness.client.post("/api/auth/login", json={"email": "pessoa@patchnotes.dev", "password": "senha-errada-1"})
    unknown = harness.client.post("/api/auth/login", json={"email": "ninguem@patchnotes.dev", "password": PASSWORD})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json() == {"message": "E-mail ou senha inválidos"}


def test_me_requires_valid_bearer_token(harness: Harness, user: dict) -> None:
    assert harness.client.get("/api/auth/me", headers=harness.auth(user["token"])).json() == {"user": user["user"]}
    for headers in ({}, {"Authorization": "Bearer lixo"}, {"Authorization": user["token"]}):
        response = harness.client.get("/api/auth/me", headers=headers)
        assert response.status_code == 401
        assert response.json() == {"message": "Sessão inválida ou expirada. Entre novamente."}


def test_expired_or_forged_access_token_is_rejected(harness: Harness, user: dict) -> None:
    secret = harness.settings.jwt_secret.get_secret_value()
    now = int(time.time())
    base = {"sub": user["user"]["id"], "type": "access", "sv": 0, "iat": now, "exp": now + 60}
    valid = jwt.encode(base, secret, algorithm="HS256")
    assert harness.client.get("/api/auth/me", headers=harness.auth(valid)).status_code == 200  # controle: só muda um campo por vez
    expired = jwt.encode({**base, "iat": now - 120, "exp": now - 60}, secret, algorithm="HS256")
    forged = jwt.encode(base, "outro-segredo-qualquer-com-32-caracteres", algorithm="HS256")
    wrong_type = jwt.encode({**base, "type": "refresh"}, secret, algorithm="HS256")
    old_version = jwt.encode({**base, "sv": 1}, secret, algorithm="HS256")
    bool_version = jwt.encode({**base, "sv": False}, secret, algorithm="HS256")
    no_version = jwt.encode({key: value for key, value in base.items() if key != "sv"}, secret, algorithm="HS256")
    for token in (expired, forged, wrong_type, old_version, bool_version, no_version):
        assert harness.client.get("/api/auth/me", headers=harness.auth(token)).status_code == 401


def test_deleted_user_token_is_rejected(harness: Harness, user: dict) -> None:
    harness.sql("DELETE FROM users")
    assert harness.client.get("/api/auth/me", headers=harness.auth(user["token"])).status_code == 401


# --- Refresh token: rotação e revogação -------------------------------------

def test_refresh_rotates_and_detects_reuse(harness: Harness, user: dict) -> None:
    first = refresh_cookie(harness)
    rotated = harness.client.post("/api/auth/refresh")
    assert rotated.status_code == 200
    assert set(rotated.json()) == {"user", "token"}
    second = refresh_cookie(harness)
    assert second and second != first

    # Reapresentar o token antigo (roubo simulado) revoga a família inteira, inclusive o token novo.
    harness.client.cookies.set("patchnotes_refresh", first, path="/api/auth")
    assert harness.client.post("/api/auth/refresh").status_code == 401
    harness.client.cookies.set("patchnotes_refresh", second, path="/api/auth")
    assert harness.client.post("/api/auth/refresh").status_code == 401

    stored = harness.sql("SELECT token_hash, revoked_at FROM refresh_tokens")
    assert all(row.revoked_at is not None for row in stored)
    assert {row.token_hash for row in stored} >= {hash_opaque_token(first), hash_opaque_token(second)}


def test_refresh_without_cookie_and_from_foreign_origin(harness: Harness, user: dict) -> None:
    assert harness.client.post("/api/auth/refresh", headers={"Origin": "https://evil.example"}).status_code == 403
    harness.client.cookies.clear()
    assert harness.client.post("/api/auth/refresh").status_code == 401


def test_expired_refresh_token_is_rejected(harness: Harness, user: dict) -> None:
    harness.sql("UPDATE refresh_tokens SET expires_at = now() - interval '1 minute'")
    assert harness.client.post("/api/auth/refresh").status_code == 401


def test_logout_revokes_refresh_token(harness: Harness, user: dict) -> None:
    token = refresh_cookie(harness)
    response = harness.client.post("/api/auth/logout")
    assert response.status_code == 204
    harness.client.cookies.set("patchnotes_refresh", token, path="/api/auth")
    assert harness.client.post("/api/auth/refresh").status_code == 401


# --- Recuperação de senha ---------------------------------------------------

def _reset_token_from_mail(harness: Harness) -> str:
    body = harness.mailer.sent[-1]["body"]
    assert "/reset-password#token=" in body  # token no fragmento: não vai a servidores nem a logs de acesso
    return body.split("#token=", 1)[1].split()[0]


def test_forgot_password_does_not_reveal_accounts(harness: Harness, user: dict) -> None:
    known = harness.client.post("/api/auth/forgot-password", json={"email": "pessoa@patchnotes.dev"})
    unknown = harness.client.post("/api/auth/forgot-password", json={"email": "ninguem@patchnotes.dev"})
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()
    assert [mail["to"] for mail in harness.mailer.sent] == ["pessoa@patchnotes.dev"]

    raw = _reset_token_from_mail(harness)
    [(stored,)] = harness.sql("SELECT token_hash FROM password_reset_tokens")
    assert stored == hash_opaque_token(raw) and stored != raw


def test_reset_password_flow_is_single_use_and_ends_sessions(harness: Harness, user: dict) -> None:
    old_access = user["token"]
    harness.client.post("/api/auth/forgot-password", json={"email": "pessoa@patchnotes.dev"})
    raw = _reset_token_from_mail(harness)
    assert harness.client.post("/api/auth/reset-password", json={"token": raw, "password": "nova-senha-123"}).status_code == 204
    reused = harness.client.post("/api/auth/reset-password", json={"token": raw, "password": "outra-senha-123"})
    assert reused.status_code == 400 and "inválido ou expirado" in reused.json()["message"]

    assert harness.client.post("/api/auth/login", json={"email": "pessoa@patchnotes.dev", "password": PASSWORD}).status_code == 401
    assert harness.client.post("/api/auth/login", json={"email": "pessoa@patchnotes.dev", "password": "nova-senha-123"}).status_code == 200
    assert harness.client.get("/api/auth/me", headers=harness.auth(old_access)).status_code == 401
    assert harness.sql("SELECT count(*) FROM refresh_tokens WHERE revoked_at IS NULL")[0][0] == 1  # só a sessão do novo login


def test_reset_password_rejects_expired_and_superseded_tokens(harness: Harness, user: dict) -> None:
    harness.client.post("/api/auth/forgot-password", json={"email": "pessoa@patchnotes.dev"})
    first = _reset_token_from_mail(harness)
    harness.client.post("/api/auth/forgot-password", json={"email": "pessoa@patchnotes.dev"})
    second = _reset_token_from_mail(harness)
    assert harness.client.post("/api/auth/reset-password", json={"token": first, "password": "nova-senha-123"}).status_code == 400

    harness.sql("UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute'")
    assert harness.client.post("/api/auth/reset-password", json={"token": second, "password": "nova-senha-123"}).status_code == 400


# --- Limites e logs ---------------------------------------------------------

def test_login_rate_limit_per_email() -> None:
    for harness in build_harness(make_settings(rate_limit_enabled=True)):
        statuses = [
            harness.client.post("/api/auth/login", json={"email": "alvo@patchnotes.dev", "password": "senha-errada-1"}).status_code
            for _ in range(11)
        ]
        assert statuses[:10] == [401] * 10
        assert statuses[10] == 429


def test_secrets_never_reach_logs(harness: Harness, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    registered = harness.register(email="logs@patchnotes.dev", password="senha-super-secreta")
    refresh = refresh_cookie(harness)
    harness.client.post("/api/auth/forgot-password", json={"email": "logs@patchnotes.dev"})
    raw_reset = _reset_token_from_mail(harness)
    harness.client.post("/api/auth/login", json={"email": "logs@patchnotes.dev", "password": "senha-super-secreta"})
    output = caplog.text
    for secret in ("senha-super-secreta", registered["token"], refresh, raw_reset, harness.settings.jwt_secret.get_secret_value()):
        assert secret and secret not in output


def test_unexpected_error_hides_internals(harness: Harness, user: dict, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import devlog_service

    async def boom(*_: object) -> None:
        raise RuntimeError("detalhe interno: senha=123 em /srv/app.py")

    monkeypatch.setattr(devlog_service, "list_entries", boom)
    harness.client._transport.raise_server_exceptions = False  # type: ignore[attr-defined]  # queremos a resposta HTTP real
    response = harness.client.get("/api/devlog/entries", headers=harness.auth(user["token"]))
    assert response.status_code == 500
    assert response.json() == {"message": "O servidor encontrou um erro inesperado. Tente novamente em instantes."}

