import pytest

from tests.conftest import Harness

PROTECTED = [
    ("GET", "/api/profile"), ("PATCH", "/api/profile"),
    ("GET", "/api/devlog/entries"), ("POST", "/api/devlog/entries"),
    ("GET", "/api/chat/history"), ("POST", "/api/chat/send"),
    ("GET", "/api/dashboard/metrics"), ("GET", "/api/dashboard/activity-heatmap"),
    ("GET", "/api/dashboard/token-usage"), ("GET", "/api/dashboard/entries-by-tag"),
    ("GET", "/api/dashboard/token-balance"), ("GET", "/api/auth/me"),
]


@pytest.mark.parametrize("method, path", PROTECTED)
def test_protected_endpoints_require_authentication(harness: Harness, method: str, path: str) -> None:
    response = harness.client.request(method, path, json={})
    assert response.status_code == 401
    assert response.json() == {"message": "Sessão inválida ou expirada. Entre novamente."}


# --- Perfil -----------------------------------------------------------------

def test_profile_get_and_partial_update(harness: Harness, user: dict) -> None:
    headers = harness.auth(user["token"])
    assert harness.client.get("/api/profile", headers=headers).json() == {"user": user["user"]}

    updated = harness.client.patch("/api/profile", headers=headers, json={"bio": "Faço jogos de plataforma.", "githubUrl": "https://github.com/exemplo"})
    assert updated.status_code == 200
    profile = updated.json()["user"]
    assert profile["name"] == "Pessoa Teste" and profile["bio"] == "Faço jogos de plataforma."
    assert profile["githubUrl"] == "https://github.com/exemplo" and profile["email"] == "pessoa@patchnotes.dev"

    renamed = harness.client.patch("/api/profile", headers=headers, json={"name": "Novo Nome", "avatarUrl": "https://cdn.exemplo.dev/a.png", "githubUrl": ""})
    assert renamed.json()["user"]["githubUrl"] == ""
    me = harness.client.get("/api/auth/me", headers=headers).json()["user"]
    assert me["name"] == "Novo Nome" and me["avatarUrl"] == "https://cdn.exemplo.dev/a.png"


@pytest.mark.parametrize("payload, field", [
    ({"name": "A"}, "name"),
    ({"bio": "x" * 241}, "bio"),
    ({"avatarUrl": "não-é-url"}, "avatarUrl"),
    ({"githubUrl": "javascript:alert(1)"}, "githubUrl"),
])
def test_profile_validation(harness: Harness, user: dict, payload: dict, field: str) -> None:
    response = harness.client.patch("/api/profile", headers=harness.auth(user["token"]), json=payload)
    assert response.status_code == 400
    assert field in response.json()["details"]["fieldErrors"]


def test_profile_ignores_email_changes(harness: Harness, user: dict) -> None:
    response = harness.client.patch("/api/profile", headers=harness.auth(user["token"]), json={"email": "outro@patchnotes.dev"})
    assert response.json()["user"]["email"] == "pessoa@patchnotes.dev"


# --- Devlog -----------------------------------------------------------------

def test_devlog_create_and_list_newest_first(harness: Harness, user: dict) -> None:
    headers = harness.auth(user["token"])
    assert harness.client.get("/api/devlog/entries", headers=headers).json() == {"entries": []}
    first = harness.client.post("/api/devlog/entries", headers=headers, json={"title": "Primeira", "content": "Conteúdo com mais de dez."})
    second = harness.client.post("/api/devlog/entries", headers=headers, json={"title": "Segunda", "content": "Outro conteúdo longo.", "tags": [" ui ", "ui", "audio"]})
    assert first.status_code == second.status_code == 201
    entry = second.json()["entry"]
    assert set(entry) == {"id", "title", "content", "tags", "createdAt"}
    assert entry["tags"] == ["ui", "audio"] and entry["createdAt"].endswith("Z")
    assert first.json()["entry"]["tags"] == []
    listed = harness.client.get("/api/devlog/entries", headers=headers).json()["entries"]
    assert [item["title"] for item in listed] == ["Segunda", "Primeira"]


@pytest.mark.parametrize("payload, field", [
    ({"title": "ab", "content": "Conteúdo válido aqui"}, "title"),
    ({"title": "Título", "content": "curto"}, "content"),
    ({"title": "Título", "content": "Conteúdo válido aqui", "tags": [""]}, "tags"),
    ({"title": "Título", "content": "Conteúdo válido aqui", "tags": ["x"] * 21}, "tags"),
])
def test_devlog_validation(harness: Harness, user: dict, payload: dict, field: str) -> None:
    response = harness.client.post("/api/devlog/entries", headers=harness.auth(user["token"]), json=payload)
    assert response.status_code == 400
    assert field in response.json()["details"]["fieldErrors"]


def test_users_only_see_their_own_data(harness: Harness, user: dict) -> None:
    other = harness.register(email="outra@patchnotes.dev")
    harness.client.post("/api/devlog/entries", headers=harness.auth(user["token"]), json={"title": "Privado", "content": "Somente da primeira pessoa."})
    assert harness.client.get("/api/devlog/entries", headers=harness.auth(other["token"])).json() == {"entries": []}
    assert harness.client.get("/api/dashboard/metrics", headers=harness.auth(other["token"])).json()["totalEntries"] == 0


def test_profile_update_does_not_undo_concurrent_password_reset(harness: Harness, user: dict) -> None:
    """S1: a redefinição de senha conclui ENTRE a autenticação do PATCH e a gravação do perfil.
    Antes, o merge do objeto antigo regravava o hash anterior e reabria as sessões antigas."""
    from app.routers.deps import get_current_user
    from app.services import auth_service

    old_token = user["token"]
    harness.client.post("/api/auth/forgot-password", json={"email": "pessoa@patchnotes.dev"})
    reset_token = harness.mailer.sent[-1]["body"].split("#token=")[1].split()[0]
    app = harness.client.app

    async def stale_user_then_concurrent_reset():  # type: ignore[no-untyped-def]
        sessionmaker = app.state.sessionmaker
        async with sessionmaker() as session:
            stale, _ = await auth_service.authenticate_access_token(session, harness.settings, old_token)
        async with sessionmaker() as session, session.begin():
            await auth_service.reset_password(session, token=reset_token, password="senha-nova-123")
        return stale

    app.dependency_overrides[get_current_user] = stale_user_then_concurrent_reset
    try:
        response = harness.client.patch("/api/profile", headers=harness.auth(old_token), json={"bio": "Atualizado na corrida"})
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200 and response.json()["user"]["bio"] == "Atualizado na corrida"

    login = lambda password: harness.client.post("/api/auth/login", json={"email": "pessoa@patchnotes.dev", "password": password})  # noqa: E731
    assert login("senha-segura-1").status_code == 401, "a senha antiga não pode voltar a valer"
    assert login("senha-nova-123").status_code == 200
