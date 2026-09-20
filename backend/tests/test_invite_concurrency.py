"""Concurrent redemption of one invite must never exceed max_uses.

Runs against a file-based SQLite database with one connection per thread. SQLite serializes
writers, so this exercises the single-UPDATE logic rather than Postgres row locking; set
TEST_DATABASE_URL (e.g. the local Docker Postgres) to run it against a real server too.
"""

import os
import threading
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import create_engine, delete, select
from sqlalchemy.orm import Session

from app.database import Base
from app.invites import consume_invite, hash_code
from app.models import InviteCode

THREADS = 12
MAX_USES = 3

URLS = [pytest.param("sqlite", id="sqlite-file")]
if os.environ.get("TEST_DATABASE_URL"):
    URLS.append(pytest.param(os.environ["TEST_DATABASE_URL"], id="postgres"))


@pytest.fixture
def engine(request, tmp_path):
    url = request.param
    if url == "sqlite":
        url = f"sqlite:///{tmp_path / 'race.db'}"
        eng = create_engine(url, connect_args={"timeout": 60})
    else:
        eng = create_engine(url, pool_size=THREADS)
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.mark.parametrize("engine", URLS, indirect=True)
def test_concurrent_redemption_cannot_exceed_max_uses(engine):
    code = "RACE-TEST"
    with Session(engine) as db:
        db.execute(delete(InviteCode).where(InviteCode.code_hash == hash_code(code)))
        db.add(
            InviteCode(
                code_hash=hash_code(code),
                expires_at=datetime.now(UTC) + timedelta(days=1),
                max_uses=MAX_USES,
            )
        )
        db.commit()

    barrier = threading.Barrier(THREADS)
    results: list[bool] = []
    errors: list[BaseException] = []
    lock = threading.Lock()

    def redeem() -> None:
        try:
            with Session(engine) as db:
                barrier.wait(timeout=30)
                ok = consume_invite(db, code)
                db.commit()
            with lock:
                results.append(ok)
        except BaseException as e:  # noqa: BLE001 - surfaced by the assertion below
            with lock:
                errors.append(e)

    threads = [threading.Thread(target=redeem) for _ in range(THREADS)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    try:
        assert not errors, errors
        assert len(results) == THREADS
        assert sum(results) == MAX_USES
        with Session(engine) as db:
            row = db.scalars(
                select(InviteCode).where(InviteCode.code_hash == hash_code(code))
            ).one()
            assert row.use_count == MAX_USES
    finally:
        with Session(engine) as db:
            db.execute(delete(InviteCode).where(InviteCode.code_hash == hash_code(code)))
            db.commit()
