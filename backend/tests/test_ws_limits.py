"""S3: limites de conexões WebSocket, inatividade, expiração do token e liberação das vagas."""

import asyncio
import time
from contextlib import ExitStack

import jwt
import pytest
from redis.asyncio import Redis
from starlette.websockets import WebSocketDisconnect

from app.core.connection_limits import MemoryConnectionSlots, RedisConnectionSlots
from tests.conftest import TEST_REDIS_URL, Harness, build_harness, make_settings
from tests.test_ws_chat import authenticate, collect_reply, connect


def _slots(harness: Harness) -> MemoryConnectionSlots:
    slots = harness.client.app.state.connection_slots  # type: ignore[attr-defined]
    assert isinstance(slots, MemoryConnectionSlots)
    return slots


def _wait_until_released(harness: Harness) -> None:
    """O servidor libera as vagas logo depois do fechamento; espera o handler terminar."""
    for _ in range(100):
        if len(_slots(harness)) == 0:
            return
        time.sleep(0.02)
    raise AssertionError("vagas não foram liberadas")


def test_per_user_connection_limit_and_release() -> None:
    for harness in build_harness(make_settings(ws_max_connections_per_user=2)):
        token = harness.register()["token"]
        with ExitStack() as stack:
            for _ in range(2):
                authenticate(stack.enter_context(connect(harness)), token)
            with connect(harness) as extra:
                extra.send_json({"type": "auth", "token": token})
                assert extra.receive_json()["code"] == "too_many_connections"
                with pytest.raises(WebSocketDisconnect) as closed:
                    extra.receive_json()
                assert closed.value.code == 4429
        # Fechar as conexões devolve as vagas: dá para abrir de novo.
        _wait_until_released(harness)
        with connect(harness) as again:
            authenticate(again, token)


def test_other_accounts_are_not_affected_by_one_users_limit() -> None:
    for harness in build_harness(make_settings(ws_max_connections_per_user=1)):
        first = harness.register(email="a@patchnotes.dev")["token"]
        second = harness.register(email="b@patchnotes.dev")["token"]
        with connect(harness) as a, connect(harness) as b:
            authenticate(a, first)
            authenticate(b, second)


def test_per_ip_limit_rejects_handshake_including_unauthenticated() -> None:
    for harness in build_harness(make_settings(ws_max_connections_per_ip=2)):
        with connect(harness), connect(harness):  # duas conexões ainda sem autenticar seguram as vagas
            with pytest.raises(WebSocketDisconnect) as rejected, connect(harness):
                pass
            assert rejected.value.code == 4429
        _wait_until_released(harness)
        with connect(harness):
            pass


def test_idle_connection_is_closed_and_slots_released() -> None:
    for harness in build_harness(make_settings(ws_idle_timeout_seconds=0.3)):
        token = harness.register()["token"]
        with connect(harness) as ws:
            authenticate(ws, token)
            with pytest.raises(WebSocketDisconnect) as closed:
                ws.receive_json()
            assert closed.value.code == 4408
        _wait_until_released(harness)


def test_connection_closes_when_access_token_expires_while_idle() -> None:
    for harness in build_harness(make_settings()):
        user = harness.register()
        now = int(time.time())
        short = jwt.encode(
            # exp em segundos inteiros: +2 garante entre 1 e 2 s de validade (com +1 o token podia nascer vencido).
            {"sub": user["user"]["id"], "type": "access", "sv": 0, "iat": now, "exp": now + 2},
            harness.settings.jwt_secret.get_secret_value(), algorithm="HS256",
        )
        with connect(harness) as ws:
            authenticate(ws, short)
            started = time.monotonic()
            assert ws.receive_json()["code"] == "unauthorized"
            with pytest.raises(WebSocketDisconnect) as closed:
                ws.receive_json()
            assert closed.value.code == 4401
            assert time.monotonic() - started < 4


def test_disconnect_during_generation_releases_slots() -> None:
    for harness in build_harness(make_settings(ws_max_connections_per_user=1)):
        token = harness.register()["token"]
        harness.llm.delay = 0.05
        with connect(harness) as ws:
            authenticate(ws, token)
            ws.send_json({"type": "message", "message": "oi"})
            assert ws.receive_json() == {"type": "start"}
        _wait_until_released(harness)
        harness.llm.delay = 0
        with connect(harness) as ws:
            authenticate(ws, token)
            ws.send_json({"type": "message", "message": "de novo"})
            assert collect_reply(ws)[1]["type"] == "done"


# --- Vagas: unidade -------------------------------------------------------------------------------------

class _Clock:
    now = 0.0

    def __call__(self) -> float:
        return self.now


def test_memory_slots_expire_without_heartbeat() -> None:
    clock = _Clock()
    slots = MemoryConnectionSlots(clock)

    async def scenario() -> None:
        first = await slots.acquire("user:1", 1, 60)
        assert first and await slots.acquire("user:1", 1, 60) is None
        clock.now = 50
        await slots.refresh("user:1", first, 60)  # heartbeat estende
        clock.now = 100
        assert await slots.acquire("user:1", 1, 60) is None
        clock.now = 200  # processo "morreu": sem heartbeat, a vaga expira
        assert await slots.acquire("user:1", 1, 60) is not None

    asyncio.run(scenario())


@pytest.mark.skipif(not TEST_REDIS_URL, reason="TEST_REDIS_URL não definido")
def test_redis_slots_are_atomic_across_replicas_and_expire() -> None:
    async def scenario() -> None:
        redis = Redis.from_url(TEST_REDIS_URL or "")
        await redis.flushdb()
        try:
            replica_a, replica_b = RedisConnectionSlots(redis), RedisConnectionSlots(redis)
            results = await asyncio.gather(*[(replica_a if i % 2 else replica_b).acquire("user:1", 3, 60) for i in range(30)])
            granted = [slot for slot in results if slot]
            assert len(granted) == 3, "30 conexões simultâneas em duas réplicas: exatamente 3 vagas"
            await replica_a.release("user:1", granted[0])
            assert await replica_b.active("user:1") == 2
            short = await replica_a.acquire("ip:1.2.3.4", 1, 0.2)
            assert short and await replica_b.acquire("ip:1.2.3.4", 1, 0.2) is None
            await asyncio.sleep(0.3)
            assert await replica_b.acquire("ip:1.2.3.4", 1, 0.2) is not None, "vaga sem heartbeat expira"
        finally:
            await redis.flushdb()
            await redis.aclose()

    asyncio.run(scenario())
