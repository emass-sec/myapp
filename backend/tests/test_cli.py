import pytest
from sqlalchemy import select

from app import cli
from app.models import User


@pytest.fixture
def cli_db(session_factory, monkeypatch):
    """Point the CLI at the test database."""
    monkeypatch.setattr(cli, "SessionLocal", session_factory)
    return session_factory


def is_admin(factory, username):
    with factory() as db:
        return db.scalars(select(User).where(User.username == username)).one().is_admin


def test_make_admin_grants_and_is_idempotent(client, cli_db, capsys):
    assert is_admin(cli_db, "alice") is False
    assert cli.main(["make-admin", "alice"]) == 0
    assert "now an admin" in capsys.readouterr().out
    assert is_admin(cli_db, "alice") is True
    assert client.get("/admin/stats").status_code == 200

    assert cli.main(["make-admin", "alice"]) == 0
    assert "already an admin" in capsys.readouterr().out


def test_make_admin_is_case_insensitive(client, cli_db):
    assert cli.main(["make-admin", "  ALICE "]) == 0
    assert is_admin(cli_db, "alice") is True


def test_make_admin_unknown_user_fails_cleanly(cli_db, capsys):
    assert cli.main(["make-admin", "nobody"]) == 1
    assert "no user named 'nobody'" in capsys.readouterr().err


def test_make_admin_requires_a_username():
    with pytest.raises(SystemExit) as exc:
        cli.main(["make-admin"])
    assert exc.value.code == 2
