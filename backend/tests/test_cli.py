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


# ---- set-password


def scripted(*answers):
    """A fake prompt that returns the given answers in order and records what was asked."""
    asked = []
    it = iter(answers)

    def prompt(text):
        asked.append(text)
        return next(it)

    prompt.asked = asked
    return prompt


def login(client, username, password):
    return client.post("/auth/login", json={"username": username, "password": password})


def test_set_password_changes_the_password(client, make_client, cli_db, capsys):
    prompt = scripted("brand-new-pw", "brand-new-pw")
    assert cli.main(["set-password", "alice"], prompt=prompt) == 0
    assert prompt.asked == ["New password: ", "Repeat new password: "]
    assert "Password updated for alice" in capsys.readouterr().out

    fresh = make_client()
    assert login(fresh, "alice", "secret1").status_code == 401  # old password
    assert login(fresh, "alice", "brand-new-pw").status_code == 200


def test_set_password_uses_argon2(client, cli_db):
    cli.main(["set-password", "alice"], prompt=scripted("brand-new-pw", "brand-new-pw"))
    with cli_db() as db:
        user = db.scalars(select(User).where(User.username == "alice")).one()
        assert user.password_hash.startswith("$argon2")
        assert "brand-new-pw" not in user.password_hash


def test_set_password_signs_out_that_users_sessions_only(client, make_client, cli_db, capsys):
    other_login = make_client()
    login(other_login, "alice", "secret1")  # a second session for alice
    bob = make_client()
    assert (
        bob.post("/auth/signup", json={"username": "bob", "password": "secret1"}).status_code == 201
    )
    assert client.get("/auth/me").status_code == 200
    assert other_login.get("/auth/me").status_code == 200

    assert cli.main(["set-password", "alice"], prompt=scripted("brand-new-pw", "brand-new-pw")) == 0
    assert "signed out 2 session(s)" in capsys.readouterr().out

    assert client.get("/auth/me").status_code == 401
    assert other_login.get("/auth/me").status_code == 401
    assert bob.get("/auth/me").status_code == 200  # other users are untouched


def test_set_password_mismatch_changes_nothing(client, cli_db, capsys):
    assert cli.main(["set-password", "alice"], prompt=scripted("first-pw-1", "second-pw-2")) == 1
    assert "do not match" in capsys.readouterr().err
    assert client.get("/auth/me").status_code == 200  # session kept
    with cli_db() as db:
        assert db.scalars(select(User).where(User.username == "alice")).one().password_hash


@pytest.mark.parametrize(("length", "expected_code"), [(5, 1), (6, 0), (128, 0), (129, 1)])
def test_set_password_enforces_signup_length_rules(
    client, make_client, cli_db, capsys, length, expected_code
):
    pw = "x" * length
    assert cli.main(["set-password", "alice"], prompt=scripted(pw, pw)) == expected_code
    out = capsys.readouterr()
    if expected_code:
        assert "between 6 and 128 characters" in out.err
        assert login(make_client(), "alice", "secret1").status_code == 200  # unchanged
    else:
        assert login(make_client(), "alice", pw).status_code == 200


def test_set_password_unknown_user_never_prompts(cli_db, capsys):
    prompt = scripted()
    assert cli.main(["set-password", "nobody"], prompt=prompt) == 1
    assert prompt.asked == []
    assert "no user named 'nobody'" in capsys.readouterr().err


def test_set_password_username_is_case_insensitive(client, cli_db):
    assert (
        cli.main(["set-password", " ALICE "], prompt=scripted("brand-new-pw", "brand-new-pw")) == 0
    )


def test_password_is_never_accepted_as_an_argument(client, cli_db):
    with pytest.raises(SystemExit) as exc:
        cli.main(["set-password", "alice", "sneaky-password"])
    assert exc.value.code == 2
    with pytest.raises(SystemExit) as exc:
        cli.main(["set-password", "alice", "--password", "sneaky-password"])
    assert exc.value.code == 2


def test_password_is_not_printed(client, cli_db, capsys):
    cli.main(["set-password", "alice"], prompt=scripted("very-secret-pw", "very-secret-pw"))
    captured = capsys.readouterr()
    assert "very-secret-pw" not in captured.out + captured.err


def test_set_password_refuses_without_a_terminal(client, cli_db, monkeypatch, capsys):
    monkeypatch.setattr(cli.sys.stdin, "isatty", lambda: False)
    assert cli.main(["set-password", "alice"]) == 1
    assert "interactive terminal" in capsys.readouterr().err


def test_default_prompt_uses_getpass(client, cli_db, monkeypatch):
    calls = []
    monkeypatch.setattr(cli.sys.stdin, "isatty", lambda: True)
    monkeypatch.setattr(cli.getpass, "getpass", lambda text: calls.append(text) or "brand-new-pw")
    assert cli.main(["set-password", "alice"]) == 0
    assert calls == ["New password: ", "Repeat new password: "]
