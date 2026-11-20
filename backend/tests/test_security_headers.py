from tests.conftest import Harness


def test_token_responses_are_never_cached(harness: Harness) -> None:
    registered = harness.client.post("/api/auth/register", json={"name": "Cache", "email": "cache@patchnotes.dev", "password": "senha-segura-1"})
    verified = harness.client.post("/api/auth/verify-email", json={"token": harness.verification_token("cache@patchnotes.dev")})
    for response in (
        registered,
        verified,
        harness.client.post("/api/auth/login", json={"email": "cache@patchnotes.dev", "password": "senha-segura-1"}),
        harness.client.post("/api/auth/refresh"),
    ):
        assert response.status_code in (200, 202), response.text
        assert response.headers["cache-control"] == "no-store"


def test_api_responses_carry_security_headers(harness: Harness, user: dict) -> None:
    for response in (
        harness.client.get("/api/dashboard/metrics", headers=harness.auth(user["token"])),
        harness.client.get("/api/auth/me"),  # 401
        harness.client.get("/api/nao-existe"),  # 404
        harness.client.post("/api/devlog/entries", headers={**harness.auth(user["token"]), "Content-Length": "999999"}, content=b"{}"),  # 413
    ):
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["x-frame-options"] == "DENY"
        assert response.headers["referrer-policy"] == "no-referrer"
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["content-security-policy"] == "default-src 'none'; frame-ancestors 'none'"


def test_swagger_keeps_working_without_the_strict_csp(harness: Harness) -> None:
    docs = harness.client.get("/docs")
    assert docs.status_code == 200
    assert "content-security-policy" not in docs.headers
    assert docs.headers["x-content-type-options"] == "nosniff"
