import pytest

from tests.conftest import Harness

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 64


def upload(harness: Harness, token: str, data: bytes, content_type: str = "image/png"):
    return harness.client.put("/api/profile/avatar", headers={**harness.auth(token), "Content-Type": content_type}, content=data)


@pytest.mark.parametrize("data, expected", [(PNG, "image/png"), (JPEG, "image/jpeg"), (WEBP, "image/webp")])
def test_upload_and_serve_avatar(harness: Harness, user: dict, data: bytes, expected: str) -> None:
    response = upload(harness, user["token"], data, "application/octet-stream")  # o tipo vem dos bytes, não do cliente
    assert response.status_code == 200
    url = response.json()["user"]["avatarUrl"]
    assert url.startswith("/api/profile/avatar?v=")
    assert harness.client.get("/api/auth/me", headers=harness.auth(user["token"])).json()["user"]["avatarUrl"] == url

    served = harness.client.get(url, headers=harness.auth(user["token"]))
    assert served.status_code == 200 and served.content == data
    assert served.headers["content-type"] == expected
    assert served.headers["x-content-type-options"] == "nosniff"
    assert served.headers["cache-control"] == "private, max-age=86400"
    assert "default-src 'none'" in served.headers["content-security-policy"]


@pytest.mark.parametrize("data", [
    b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
    b"<html><script>alert(1)</script></html>",
    b"GIF89a" + b"\x00" * 32,
    b"",
])
def test_rejects_anything_that_is_not_png_jpeg_or_webp(harness: Harness, user: dict, data: bytes) -> None:
    response = upload(harness, user["token"], data, "image/png")  # mentir o Content-Type não adianta
    assert response.status_code == 400
    assert response.json()["message"] == "Envie uma imagem PNG, JPEG ou WebP."
    assert harness.sql("SELECT count(*) FROM user_avatars")[0][0] == 0


def test_avatar_size_limit(harness: Harness, user: dict) -> None:
    limit = harness.settings.avatar_max_bytes
    assert upload(harness, user["token"], PNG + b"\x00" * (limit - len(PNG))).status_code == 200  # no limite: aceita
    assert upload(harness, user["token"], PNG + b"\x00" * limit).status_code == 413
    # O limite maior vale só para o avatar: as demais rotas continuam com 64 KB.
    big = harness.client.post("/api/devlog/entries", headers={**harness.auth(user["token"]), "Content-Type": "application/json"}, content=b"x" * (70 * 1024))
    assert big.status_code == 413


def test_replacing_and_deleting_avatar(harness: Harness, user: dict) -> None:
    first = upload(harness, user["token"], PNG).json()["user"]["avatarUrl"]
    second = upload(harness, user["token"], JPEG).json()["user"]["avatarUrl"]
    assert first != second  # versão nova na URL a cada envio
    assert harness.sql("SELECT count(*) FROM user_avatars")[0][0] == 1

    removed = harness.client.delete("/api/profile/avatar", headers=harness.auth(user["token"]))
    assert removed.status_code == 200 and "avatarUrl" not in removed.json()["user"]
    assert harness.client.get("/api/profile/avatar", headers=harness.auth(user["token"])).status_code == 404


def test_avatar_is_private_to_its_owner(harness: Harness, user: dict) -> None:
    upload(harness, user["token"], PNG)
    other = harness.register(email="outra@patchnotes.dev")
    assert harness.client.get("/api/profile/avatar", headers=harness.auth(other["token"])).status_code == 404
    assert harness.client.get("/api/profile/avatar").status_code == 401
