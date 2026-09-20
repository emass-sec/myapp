from collections.abc import Callable, Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


@pytest.fixture
def make_client() -> Iterator[Callable[[], TestClient]]:
    """Factory for independent clients (separate cookie jars) sharing one in-memory database."""
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    testing_session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        with testing_session() as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db
    clients: list[TestClient] = []

    def make() -> TestClient:
        # https base URL so the Secure session cookie is sent back, as in production.
        c = TestClient(app, base_url="https://testserver")
        clients.append(c)
        return c

    yield make
    for c in clients:
        c.close()
    app.dependency_overrides.clear()
    engine.dispose()


@pytest.fixture
def client(make_client: Callable[[], TestClient]) -> TestClient:
    """A client already signed up and logged in as user 'alice'."""
    c = make_client()
    assert (
        c.post("/auth/signup", json={"username": "alice", "password": "secret1"}).status_code == 201
    )
    return c
