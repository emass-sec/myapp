from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.config import settings
from app.invites import generate_code, hash_code, normalize_code
from app.models import InviteCode, User

INVALID = {"detail": "Invalid invite code"}


@pytest.fixture
def invite_mode(monkeypatch):
    monkeypatch.setattr(settings, "signup_mode", "invite")


def signup(c, username="newbie", code=None, password="secret1"):
    body = {"username": username, "password": password}
    if code is not None:
        body["invite_code"] = code
    return c.post("/auth/signup", json=body)


def new_invite(admin, **options):
    return admin.post("/admin/invites", json=options).json()


def set_invite(session_factory, invite_id, **fields):
    with session_factory() as db:
        row = db.get(InviteCode, invite_id)
        for k, v in fields.items():
            setattr(row, k, v)
        db.commit()


def test_code_helpers():
    assert normalize_code(" k7mq-3xwd ") == "K7MQ3XWD"
    assert hash_code("k7mq-3xwd") == hash_code("K7MQ3XWD")
    assert len(hash_code("K7MQ-3XWD")) == 64
    assert all(len(generate_code()) == 9 for _ in range(50))


def test_invite_mode_requires_a_code(make_client, admin, invite_mode):
    assert signup(make_client()).status_code == 403
    assert signup(make_client(), code="").status_code == 403
    assert signup(make_client(), code="ABCD-EFGH").json() == INVALID


def test_code_works_once(make_client, admin, invite_mode):
    code = new_invite(admin)["code"]
    assert signup(make_client(), "one", code).status_code == 201
    second = signup(make_client(), "two", code)
    assert second.status_code == 403 and second.json() == INVALID


def test_max_uses_allows_exactly_that_many(make_client, admin, invite_mode):
    invite = new_invite(admin, max_uses=2)
    results = [signup(make_client(), f"u{i}", invite["code"]).status_code for i in range(3)]
    assert results == [201, 201, 403]
    listed = admin.get("/admin/invites").json()[0]
    assert (listed["use_count"], listed["status"]) == (2, "used_up")


def test_code_is_case_and_dash_insensitive(make_client, admin, invite_mode):
    code = new_invite(admin)["code"]
    assert signup(make_client(), "loose", code.lower().replace("-", " ")).status_code == 201


def test_expired_code_rejected(make_client, admin, invite_mode, session_factory):
    invite = new_invite(admin)
    set_invite(session_factory, invite["id"], expires_at=datetime.now(UTC) - timedelta(minutes=1))
    resp = signup(make_client(), code=invite["code"])
    assert (resp.status_code, resp.json()) == (403, INVALID)
    assert admin.get("/admin/invites").json()[0]["status"] == "expired"


def test_revoked_code_rejected(make_client, admin, invite_mode):
    invite = new_invite(admin)
    admin.post(f"/admin/invites/{invite['id']}/revoke")
    resp = signup(make_client(), code=invite["code"])
    assert (resp.status_code, resp.json()) == (403, INVALID)


def test_all_failure_reasons_look_identical(make_client, admin, invite_mode, session_factory):
    expired = new_invite(admin)
    revoked = new_invite(admin)
    used = new_invite(admin)
    set_invite(session_factory, expired["id"], expires_at=datetime.now(UTC) - timedelta(days=1))
    admin.post(f"/admin/invites/{revoked['id']}/revoke")
    assert signup(make_client(), "first", used["code"]).status_code == 201

    responses = [
        signup(make_client(), f"x{i}", code)
        for i, code in enumerate(
            [expired["code"], revoked["code"], used["code"], "ZZZZ-ZZZZ", "not a code"]
        )
    ]
    assert {(r.status_code, r.text) for r in responses} == {
        (403, '{"detail":"Invalid invite code"}')
    }


def test_username_conflict_does_not_consume_the_code(make_client, admin, invite_mode):
    invite = new_invite(admin)
    assert signup(make_client(), "boss", invite["code"]).status_code == 409
    assert admin.get("/admin/invites").json()[0]["use_count"] == 0
    assert signup(make_client(), "fresh", invite["code"]).status_code == 201


def test_username_probe_needs_a_valid_code(make_client, admin, invite_mode):
    # Existing username with a bad code: the same generic invite error, not "already taken".
    assert signup(make_client(), "boss", "BAAD-C0DE").json() == INVALID


def test_invalid_password_does_not_consume_the_code(make_client, admin, invite_mode):
    invite = new_invite(admin)
    assert signup(make_client(), code=invite["code"], password="short").status_code == 422
    assert admin.get("/admin/invites").json()[0]["use_count"] == 0


def test_new_user_gets_a_session_and_is_not_admin(make_client, admin, invite_mode):
    c = make_client()
    assert signup(c, "member", new_invite(admin)["code"]).status_code == 201
    me = c.get("/auth/me").json()
    assert (me["username"], me["is_admin"]) == ("member", False)


def test_open_mode_ignores_codes(make_client):
    assert settings.signup_mode == "open"
    assert signup(make_client(), "a").status_code == 201
    assert signup(make_client(), "b", code="whatever").status_code == 201


def test_closed_mode_rejects_everyone(monkeypatch, make_client, admin):
    code = new_invite(admin)["code"]
    monkeypatch.setattr(settings, "signup_mode", "closed")
    for c in (None, code):
        resp = signup(make_client(), "nope", c)
        assert (resp.status_code, resp.json()) == (403, {"detail": "Signups are closed"})
    # The code was not consumed, and existing users can still log in.
    assert admin.get("/admin/invites").json()[0]["use_count"] == 0
    login = make_client().post("/auth/login", json={"username": "boss", "password": "secret1"})
    assert login.status_code == 200


@pytest.mark.parametrize("mode", ["open", "invite", "closed"])
def test_auth_config_reports_mode(monkeypatch, make_client, mode):
    monkeypatch.setattr(settings, "signup_mode", mode)
    assert make_client().get("/auth/config").json() == {"signup_mode": mode}


def test_failed_code_guesses_are_rate_limited(invite_mode, make_client):
    c = make_client()
    for i in range(settings.signup_max_per_hour):
        assert signup(c, f"g{i}", "ABCD-EFGH").status_code == 403
    assert signup(c, "late", "ABCD-EFGH").status_code == 429


def test_no_user_created_on_failed_invite(invite_mode, make_client, session_factory):
    signup(make_client(), "ghost", "ABCD-EFGH")
    with session_factory() as db:
        assert db.scalars(select(User).where(User.username == "ghost")).first() is None
