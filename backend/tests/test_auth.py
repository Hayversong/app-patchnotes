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

def test_register_confirms_by_email_before_creating_the_account(harness: Harness) -> None:
    response = harness.client.post("/api/auth/register", json={"name": "Ada Teste", "email": "Ada@Patchnotes.DEV", "password": PASSWORD})
    assert response.status_code == 202
    assert response.json() == {"message": "Enviamos um link de confirmação para o e-mail informado. Abra-o para ativar a conta."}
    assert "set-cookie" not in response.headers
    assert harness.sql("SELECT count(*) FROM users")[0][0] == 0  # a conta só nasce na confirmação
    [(stored_hash, token_hash)] = harness.sql("SELECT password_hash, token_hash FROM pending_registrations WHERE email = 'ada@patchnotes.dev'")
    assert stored_hash.startswith("$argon2id$") and PASSWORD not in stored_hash

    token = harness.verification_token("ada@patchnotes.dev")
    assert token_hash == hash_opaque_token(token) and token not in token_hash  # no banco, só o hash
    verified = harness.client.post("/api/auth/verify-email", json={"token": token})
    assert verified.status_code == 200
    body = verified.json()
    assert set(body) == {"user"}  # o token não vai no corpo
    assert set(body["user"]) == {"id", "name", "email"}
    assert body["user"]["email"] == "ada@patchnotes.dev"
    cookies = [value.lower() for value in verified.headers.get_list("set-cookie")]
    access = next(value for value in cookies if value.startswith("patchnotes_access="))
    refresh = next(value for value in cookies if value.startswith("patchnotes_refresh="))
    assert "httponly" in access and "samesite=strict" in access and "path=/" in access
    assert "httponly" in refresh and "samesite=strict" in refresh and "path=/api/auth" in refresh
    assert harness.sql("SELECT count(*) FROM pending_registrations")[0][0] == 0

    # Uso único.
    assert harness.client.post("/api/auth/verify-email", json={"token": token}).status_code == 400


def test_register_response_is_identical_for_existing_email(harness: Harness) -> None:
    harness.register(email="dup@patchnotes.dev")
    harness.mailer.sent.clear()
    existing = harness.client.post("/api/auth/register", json={"name": "Outra", "email": "DUP@patchnotes.dev", "password": PASSWORD})
    new = harness.client.post("/api/auth/register", json={"name": "Nova", "email": "nova@patchnotes.dev", "password": PASSWORD})
    assert existing.status_code == new.status_code == 202
    assert existing.json() == new.json()
    assert existing.headers.get("set-cookie") is None and new.headers.get("set-cookie") is None
    # A dona do e-mail é avisada; nenhum pedido pendente é criado para um e-mail que já tem conta.
    [notice] = [mail for mail in harness.mailer.sent if mail["to"] == "dup@patchnotes.dev"]
    assert "já tem cadastro" in notice["body"] and "verify-email" not in notice["body"]
    assert [row.email for row in harness.sql("SELECT email FROM pending_registrations")] == ["nova@patchnotes.dev"]


def test_registering_someone_elses_email_never_creates_an_account_with_the_attackers_password(harness: Harness) -> None:
    harness.client.post("/api/auth/register", json={"name": "Atacante", "email": "vitima@patchnotes.dev", "password": "senha-do-atacante"})
    # A vítima se cadastra depois: o pedido novo substitui o do atacante e o link antigo deixa de valer.
    harness.client.post("/api/auth/register", json={"name": "Vítima", "email": "vitima@patchnotes.dev", "password": PASSWORD})
    links = [mail["body"].split("verify-email#token=", 1)[1].split()[0] for mail in harness.mailer.sent if "verify-email#token=" in mail["body"]]
    assert len(links) == 2
    assert harness.client.post("/api/auth/verify-email", json={"token": links[0]}).status_code == 400
    assert harness.client.post("/api/auth/verify-email", json={"token": links[1]}).status_code == 200
    assert harness.client.post("/api/auth/login", json={"email": "vitima@patchnotes.dev", "password": "senha-do-atacante"}).status_code == 401
    assert harness.client.post("/api/auth/login", json={"email": "vitima@patchnotes.dev", "password": PASSWORD}).status_code == 200


def test_expired_or_unknown_verification_link_is_rejected(harness: Harness) -> None:
    harness.client.post("/api/auth/register", json={"name": "Ada", "email": "ada@patchnotes.dev", "password": PASSWORD})
    token = harness.verification_token("ada@patchnotes.dev")
    harness.sql("UPDATE pending_registrations SET expires_at = now() - interval '1 minute'")
    for value in (token, "x" * 43):
        response = harness.client.post("/api/auth/verify-email", json={"token": value})
        assert response.status_code == 400
        assert response.json() == {"message": "Link de confirmação inválido ou expirado. Faça o cadastro de novo."}
    assert harness.sql("SELECT count(*) FROM users")[0][0] == 0


def test_register_does_no_database_work_before_responding(harness: Harness) -> None:
    """Hash da senha, consulta e e-mail rodam depois da resposta: o tempo não revela se o e-mail tem conta."""
    observed: list[int] = []
    engine = harness.client.app.state.engine  # type: ignore[attr-defined]
    original = harness.mailer.send

    async def spy(**kwargs: str) -> None:
        observed.append(1)
        await original(**kwargs)

    harness.mailer.send = spy  # type: ignore[method-assign]
    response = harness.client.post("/api/auth/register", json={"name": "Ada", "email": "ada@patchnotes.dev", "password": PASSWORD})
    assert response.status_code == 202 and observed == [1]  # tarefa de fundo rodou (o TestClient espera por ela)
    assert engine.pool.checkedout() == 0


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
    assert set(rotated.json()) == {"user"}
    assert rotated.cookies.get("patchnotes_access")  # access token novo, só no cookie
    second = refresh_cookie(harness)
    assert second and second != first

    # Reapresentar o token antigo (roubo simulado) revoga a família inteira, inclusive o token novo.
    # O pote de cookies é limpo antes: só o token escolhido vai na requisição.
    harness.client.cookies.clear()
    harness.client.cookies.set("patchnotes_refresh", first, path="/api/auth")
    assert harness.client.post("/api/auth/refresh").status_code == 401
    harness.client.cookies.clear()
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



def test_forgot_password_does_no_database_work_before_responding(harness: Harness, user: dict) -> None:
    """S7: a consulta e a escrita do token acontecem só depois da resposta, para o tempo não revelar a conta."""
    from app.services import auth_service

    calls: list[str] = []
    original = auth_service.request_password_reset

    async def spy(session, settings, email):  # type: ignore[no-untyped-def]
        calls.append(email)
        return await original(session, settings, email)

    auth_service.request_password_reset = spy  # type: ignore[assignment]
    try:
        captured: list[object] = []
        original_add = __import__("starlette.background", fromlist=["BackgroundTasks"]).BackgroundTasks.add_task

        def capture(self, func, *args, **kwargs):  # type: ignore[no-untyped-def]
            captured.append(func)
            return original_add(self, func, *args, **kwargs)

        import starlette.background as background

        background.BackgroundTasks.add_task = capture  # type: ignore[method-assign]
        try:
            for email in ("pessoa@patchnotes.dev", "ninguem@patchnotes.dev"):
                response = harness.client.post("/api/auth/forgot-password", json={"email": email})
                assert response.status_code == 202
        finally:
            background.BackgroundTasks.add_task = original_add  # type: ignore[method-assign]
        assert captured == [auth_service.process_password_reset_request] * 2, "as duas contas seguem o mesmo caminho"
        assert calls == ["pessoa@patchnotes.dev", "ninguem@patchnotes.dev"]
        assert len(harness.mailer.sent) == 1 and harness.mailer.sent[0]["to"] == "pessoa@patchnotes.dev"
    finally:
        auth_service.request_password_reset = original  # type: ignore[assignment]


def test_forgot_password_background_failure_is_logged_without_email(harness: Harness, caplog: pytest.LogCaptureFixture) -> None:
    from app.services import auth_service

    async def broken(session, settings, email):  # type: ignore[no-untyped-def]
        raise RuntimeError("banco fora do ar")

    original = auth_service.request_password_reset
    auth_service.request_password_reset = broken  # type: ignore[assignment]
    try:
        response = harness.client.post("/api/auth/forgot-password", json={"email": "segredo@patchnotes.dev"})
    finally:
        auth_service.request_password_reset = original  # type: ignore[assignment]
    assert response.status_code == 202
    assert "Falha ao preparar a redefinição de senha: RuntimeError" in caplog.text
    assert "segredo@patchnotes.dev" not in caplog.text
