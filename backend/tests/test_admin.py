from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.invites import hash_code
from app.models import InviteCode, User

ADMIN_ROUTES = [
    ("post", "/admin/invites", {"json": {}}),
    ("get", "/admin/invites", {}),
    ("post", "/admin/invites/1/revoke", {}),
    ("get", "/admin/stats", {}),
]


@pytest.mark.parametrize(("method", "path", "kwargs"), ADMIN_ROUTES)
def test_non_admin_gets_403(client, method, path, kwargs):
    assert getattr(client, method)(path, **kwargs).status_code == 403


@pytest.mark.parametrize(("method", "path", "kwargs"), ADMIN_ROUTES)
def test_unauthenticated_gets_401(make_client, method, path, kwargs):
    assert getattr(make_client(), method)(path, **kwargs).status_code == 401


def test_admin_flag_is_not_settable_via_signup(make_client):
    c = make_client()
    resp = c.post("/auth/signup", json={"username": "eve", "password": "secret1", "is_admin": True})
    assert resp.status_code == 201
    assert c.get("/auth/me").json()["is_admin"] is False
    assert c.get("/admin/stats").status_code == 403


def test_me_reports_admin(admin, client):
    assert admin.get("/auth/me").json()["is_admin"] is True
    assert client.get("/auth/me").json()["is_admin"] is False


def test_admin_rights_revoked_take_effect_immediately(admin, session_factory):
    assert admin.get("/admin/stats").status_code == 200
    with session_factory() as db:
        db.scalars(select(User).where(User.username == "boss")).one().is_admin = False
        db.commit()
    assert admin.get("/admin/stats").status_code == 403


def test_create_invite_returns_code_once_and_stores_only_hash(admin, session_factory):
    resp = admin.post("/admin/invites", json={})
    assert resp.status_code == 201
    body = resp.json()
    code = body["code"]
    assert len(code) == 9 and code[4] == "-"
    assert set(code.replace("-", "")) <= set("ABCDEFGHJKMNPQRSTUVWXYZ23456789")
    assert (body["max_uses"], body["use_count"], body["status"]) == (1, 0, "active")
    assert body["created_by"] == "boss"

    with session_factory() as db:
        row = db.scalars(select(InviteCode)).one()
        assert row.code_hash == hash_code(code)
        assert code not in (row.code_hash, str(row.__dict__))
        expires = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=UTC)
        assert timedelta(days=6, hours=23) < expires - datetime.now(UTC) <= timedelta(days=7)

    listed = admin.get("/admin/invites").json()
    assert len(listed) == 1 and "code" not in listed[0] and code not in str(listed)


def test_invite_options_and_bounds(admin):
    body = admin.post("/admin/invites", json={"max_uses": 5, "expires_in_days": 30}).json()
    assert body["max_uses"] == 5
    for bad in (
        {"max_uses": 0},
        {"max_uses": 101},
        {"expires_in_days": 0},
        {"expires_in_days": 91},
    ):
        assert admin.post("/admin/invites", json=bad).status_code == 422


def test_generated_codes_are_unique(admin):
    codes = {admin.post("/admin/invites", json={}).json()["code"] for _ in range(20)}
    assert len(codes) == 20


def test_list_is_newest_first_with_statuses(admin):
    first = admin.post("/admin/invites", json={}).json()
    second = admin.post("/admin/invites", json={}).json()
    admin.post(f"/admin/invites/{first['id']}/revoke")
    listed = admin.get("/admin/invites").json()
    assert [i["id"] for i in listed] == [second["id"], first["id"]]
    assert [i["status"] for i in listed] == ["active", "revoked"]


def test_revoke_is_idempotent_and_404s_for_unknown(admin):
    invite = admin.post("/admin/invites", json={}).json()
    assert admin.post(f"/admin/invites/{invite['id']}/revoke").json()["revoked"] is True
    assert admin.post(f"/admin/invites/{invite['id']}/revoke").status_code == 200
    assert admin.post("/admin/invites/9999/revoke").status_code == 404


def test_stats(admin, client, make_client, session_factory):
    client.post("/notes", json={"title": "private"})
    client.post("/notes", json={"title": "public", "is_public": True})
    stats = admin.get("/admin/stats").json()
    assert (stats["users"], stats["notes"], stats["shared_notes"]) == (2, 2, 1)

    series = stats["signups_per_day"]
    assert len(series) == 30
    assert series[-1]["date"] == datetime.now(UTC).date().isoformat()
    assert [s["count"] for s in series][-1] == 2  # both users signed up today
    assert sum(s["count"] for s in series) == 2
    assert series == sorted(series, key=lambda s: s["date"])


def test_stats_ignore_signups_older_than_30_days(admin, session_factory):
    with session_factory() as db:
        old = User(username="old", password_hash="x")
        old.created_at = datetime.now(UTC) - timedelta(days=45)
        db.add(old)
        db.commit()
    stats = admin.get("/admin/stats").json()
    assert stats["users"] == 2  # still counted overall
    assert sum(s["count"] for s in stats["signups_per_day"]) == 1  # but not in the window
