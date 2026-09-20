from collections.abc import Callable, Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.models import User


@pytest.fixture(autouse=True)
def open_signup(monkeypatch: pytest.MonkeyPatch) -> None:
    """Most tests sign users up freely; tests of invite/closed modes override this."""
    monkeypatch.setattr(settings, "signup_mode", "open")


@pytest.fixture
def session_factory() -> Iterator[sessionmaker[Session]]:
    """One in-memory database shared by the app and by tests that touch it directly."""
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        with factory() as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db
    yield factory
    app.dependency_overrides.clear()
    engine.dispose()


@pytest.fixture
def make_client(session_factory) -> Iterator[Callable[[], TestClient]]:
    """Factory for independent clients (separate cookie jars) sharing one in-memory database."""
    clients: list[TestClient] = []

    def make() -> TestClient:
        # https base URL so the Secure session cookie is sent back, as in production.
        c = TestClient(app, base_url="https://testserver")
        clients.append(c)
        return c

    yield make
    for c in clients:
        c.close()


@pytest.fixture
def client(make_client: Callable[[], TestClient]) -> TestClient:
    """A client already signed up and logged in as user 'alice'."""
    c = make_client()
    resp = c.post("/auth/signup", json={"username": "alice", "password": "secret1"})
    assert resp.status_code == 201
    return c


@pytest.fixture
def grant_admin(session_factory) -> Callable[[str], None]:
    def grant(username: str) -> None:
        with session_factory() as db:
            db.scalars(select(User).where(User.username == username)).one().is_admin = True
            db.commit()

    return grant


@pytest.fixture
def admin(make_client, grant_admin) -> TestClient:
    """A logged-in admin ('boss')."""
    c = make_client()
    resp = c.post("/auth/signup", json={"username": "boss", "password": "secret1"})
    assert resp.status_code == 201
    grant_admin("boss")
    return c
