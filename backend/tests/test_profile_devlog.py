from datetime import datetime

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
    assert harness.client.get("/api/auth/me", headers=harness.auth(old_token)).status_code == 401, "sessões antigas continuam encerradas"


# --- Paginação e limites de escrita ------------------------------------------

def _entries(harness: Harness, token: str, **params: object) -> dict:
    response = harness.client.get("/api/devlog/entries", headers=harness.auth(token), params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_devlog_pagination_is_stable_with_ties_and_omits_cursor_at_the_end(harness: Harness, user: dict) -> None:
    # 5 entradas, três com o MESMO created_at: o desempate por id não pode duplicar nem pular entradas.
    for index, moment in enumerate(["2026-11-01T10:00:00Z", "2026-11-02T10:00:00Z", "2026-11-02T10:00:00Z", "2026-11-02T10:00:00Z", "2026-11-03T10:00:00Z"]):
        harness.sql(
            "INSERT INTO devlog_entries (id, user_id, title, content, tags, created_at) VALUES (gen_random_uuid(), :u, :t, 'conteúdo', '{}', :c)",
            u=user["user"]["id"], t=f"E{index}", c=datetime.fromisoformat(moment),
        )
    everything = _entries(harness, user["token"])
    assert "nextCursor" not in everything and len(everything["entries"]) == 5  # sem parâmetros: igual à Parte 1

    seen: list[str] = []
    page = _entries(harness, user["token"], limit=2)
    pages = 1
    while "nextCursor" in page:
        seen += [entry["id"] for entry in page["entries"]]
        page = _entries(harness, user["token"], limit=2, cursor=page["nextCursor"])
        pages += 1
    seen += [entry["id"] for entry in page["entries"]]
    assert pages == 3 and seen == [entry["id"] for entry in everything["entries"]]


def test_devlog_default_page_is_capped(harness: Harness, user: dict) -> None:
    harness.sql(
        "INSERT INTO devlog_entries (id, user_id, title, content, tags, created_at)"
        " SELECT gen_random_uuid(), :u, 'T' || n, 'conteúdo', '{}', now() - n * interval '1 minute' FROM generate_series(1, 105) n",
        u=user["user"]["id"],
    )
    first = _entries(harness, user["token"])
    assert len(first["entries"]) == 100 and "nextCursor" in first
    assert len(_entries(harness, user["token"], cursor=first["nextCursor"])["entries"]) == 5


@pytest.mark.parametrize("params, field", [({"limit": 0}, "limit"), ({"limit": 101}, "limit"), ({"cursor": "não-é-cursor"}, "cursor"), ({"cursor": "e30"}, "cursor")])
def test_devlog_pagination_validation(harness: Harness, user: dict, params: dict, field: str) -> None:
    response = harness.client.get("/api/devlog/entries", headers=harness.auth(user["token"]), params=params)
    assert response.status_code == 400
    assert field in response.json()["details"]["fieldErrors"]


def test_devlog_cursor_never_reveals_other_users_entries(harness: Harness, user: dict) -> None:
    other = harness.register(email="outra@patchnotes.dev")
    for title in ("Primeira entrada", "Segunda entrada"):
        harness.client.post("/api/devlog/entries", headers=harness.auth(other["token"]), json={"title": title, "content": "Conteúdo da outra conta."})
    cursor = _entries(harness, other["token"], limit=1)["nextCursor"]
    assert _entries(harness, user["token"], cursor=cursor) == {"entries": []}


def test_devlog_and_profile_writes_are_rate_limited_per_user() -> None:
    from tests.conftest import build_harness, make_settings

    for harness in build_harness(make_settings(rate_limit_enabled=True)):
        token = harness.register()["token"]
        other = harness.register(email="outra@patchnotes.dev")["token"]
        payload = {"title": "Entrada", "content": "Conteúdo longo o bastante."}
        statuses = [harness.client.post("/api/devlog/entries", headers=harness.auth(token), json=payload).status_code for _ in range(31)]
        assert statuses[:30] == [201] * 30 and statuses[30] == 429
        assert harness.client.post("/api/devlog/entries", headers=harness.auth(other), json=payload).status_code == 201
        patches = [harness.client.patch("/api/profile", headers=harness.auth(token), json={"bio": "x"}).status_code for _ in range(21)]
        assert patches[:20] == [200] * 20 and patches[20] == 429
