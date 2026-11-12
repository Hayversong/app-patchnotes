"""Rotina de limpeza: lotes, o que é apagado/preservado e exclusão mútua entre réplicas."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import text

from app.services.maintenance_service import CLEANUP_LOCK_KEY, run_cleanup
from tests.conftest import Harness


def _seed(harness: Harness, user_id: str) -> None:
    now = datetime.now(UTC)
    old, recent, future = now - timedelta(days=3), now - timedelta(hours=1), now + timedelta(days=3)
    for index, (expires, revoked) in enumerate([(old, None), (old, old), (old, None), (future, None), (future, recent)]):
        harness.sql(
            "INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, expires_at, created_at, revoked_at)"
            " VALUES (gen_random_uuid(), :u, gen_random_uuid(), :h, :e, :c, :r)",
            u=user_id, h=f"refresh-{index}".ljust(64, "x"), e=expires, c=old, r=revoked,
        )
    for index, (expires, used) in enumerate([(old, None), (future, old), (future, None), (future, recent)]):
        harness.sql(
            "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at, used_at)"
            " VALUES (gen_random_uuid(), :u, :h, :e, :c, :used)",
            u=user_id, h=f"reset-{index}".ljust(64, "x"), e=expires, c=old, used=used,
        )
    for created, status in [(old, "pending"), (old, "pending"), (now, "pending"), (old, "complete")]:
        harness.sql(
            "INSERT INTO chat_messages (id, user_id, role, content, status, created_at) VALUES (gen_random_uuid(), :u, 'user', 'oi', :s, :c)",
            u=user_id, s=status, c=created,
        )


def test_cleanup_removes_only_stale_rows_in_batches(harness: Harness, user: dict) -> None:
    harness.sql("DELETE FROM refresh_tokens")  # descarta o refresh do cadastro (válido) para contar exato
    _seed(harness, user["user"]["id"])
    engine = harness.client.app.state.engine  # type: ignore[attr-defined]
    report = harness.run(lambda: run_cleanup(engine, harness.settings, batch=2, pause=0))
    assert (report.refresh_tokens, report.reset_tokens, report.orphan_messages, report.skipped) == (3, 2, 2, False)
    # Preservados: refresh ainda válidos (inclusive revogado: detecta reuso até vencer), reset válido/usado há pouco.
    assert harness.sql("SELECT count(*) FROM refresh_tokens")[0][0] == 2
    assert harness.sql("SELECT count(*) FROM password_reset_tokens")[0][0] == 2
    assert sorted(row[0] for row in harness.sql("SELECT status FROM chat_messages")) == ["complete", "failed", "failed", "pending"]
    again = harness.run(lambda: run_cleanup(engine, harness.settings, batch=2, pause=0))
    assert (again.refresh_tokens, again.reset_tokens, again.orphan_messages) == (0, 0, 0)


def test_cleanup_is_skipped_while_another_replica_holds_the_lock(harness: Harness, user: dict) -> None:
    _seed(harness, user["user"]["id"])
    engine = harness.client.app.state.engine  # type: ignore[attr-defined]

    async def scenario() -> tuple[bool, int]:
        async with engine.connect() as other:
            await other.execute(text("SELECT pg_advisory_lock(:k)"), {"k": CLEANUP_LOCK_KEY})
            report = await run_cleanup(engine, harness.settings, batch=2, pause=0)
            await other.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": CLEANUP_LOCK_KEY})
        return report.skipped, report.refresh_tokens

    assert harness.run(scenario) == (True, 0)
    assert harness.run(lambda: run_cleanup(engine, harness.settings, batch=2, pause=0)).skipped is False
