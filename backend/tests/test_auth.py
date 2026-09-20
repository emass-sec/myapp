import pytest

from app.config import settings


def signup(c, username="bob", password="secret1"):
    return c.post("/auth/signup", json={"username": username, "password": password})


def login(c, username="bob", password="secret1"):
    return c.post("/auth/login", json={"username": username, "password": password})


def test_signup_logs_in_and_me(make_client):
    c = make_client()
    resp = signup(c)
    assert resp.status_code == 201
    assert resp.json()["username"] == "bob"
    assert "password" not in resp.text
    assert c.get("/auth/me").json()["username"] == "bob"


def test_me_requires_session(make_client):
    assert make_client().get("/auth/me").status_code == 401


def test_session_cookie_flags(make_client):
    resp = signup(make_client())
    cookie = resp.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "secure" in cookie
    assert "samesite=lax" in cookie


def test_password_is_argon2_hashed(make_client):
    from app.database import get_db
    from app.main import app
    from app.models import User

    signup(make_client())
    db = next(app.dependency_overrides[get_db]())
    user = db.query(User).one()
    assert user.password_hash.startswith("$argon2")
    assert "secret1" not in user.password_hash


def test_username_is_case_insensitive_and_unique(make_client):
    signup(make_client(), "Bob")
    resp = signup(make_client(), "bOB")
    assert resp.status_code == 409


def test_password_five_chars_rejected(make_client):
    resp = signup(make_client(), password="12345")
    assert resp.status_code == 422
    assert "at least" not in resp.text  # custom message, not pydantic's default
    assert "between 6 and 128" in resp.json()["detail"][0]["msg"]


def test_password_six_chars_accepted(make_client):
    assert signup(make_client(), password="123456").status_code == 201


def test_password_max_128(make_client):
    assert signup(make_client(), "a", "x" * 128).status_code == 201
    assert signup(make_client(), "b", "x" * 129).status_code == 422


def test_login_and_logout(make_client):
    signup(make_client())
    c = make_client()
    assert login(c).status_code == 200
    assert c.get("/auth/me").status_code == 200
    assert c.post("/auth/logout").status_code == 204
    assert c.get("/auth/me").status_code == 401


def test_logout_invalidates_session_server_side(make_client):
    c = make_client()
    signup(c)
    token = c.cookies["session"]
    c.post("/auth/logout")
    c.cookies.set("session", token)  # replay the old cookie
    assert c.get("/auth/me").status_code == 401


def test_login_errors_are_generic(make_client):
    signup(make_client())
    wrong_pw = login(make_client(), password="wrongpw")
    no_user = login(make_client(), username="nobody")
    assert wrong_pw.status_code == no_user.status_code == 401
    assert wrong_pw.json() == no_user.json() == {"detail": "Invalid account or password"}


def test_login_rate_limited(make_client):
    signup(make_client())
    c = make_client()
    for _ in range(settings.login_max_failures):
        assert login(c, password="wrongpw").status_code == 401
    # Even the correct password is refused while locked out.
    resp = login(c)
    assert resp.status_code == 429
    assert "Retry-After" in resp.headers


def test_successful_login_resets_failures(make_client):
    signup(make_client())
    c = make_client()
    for _ in range(settings.login_max_failures - 1):
        login(c, password="wrongpw")
    assert login(c).status_code == 200
    for _ in range(settings.login_max_failures - 1):
        assert login(c, password="wrongpw").status_code == 401


def test_signup_rate_limited(make_client):
    c = make_client()
    for i in range(settings.signup_max_per_hour):
        assert signup(c, f"user{i}").status_code == 201
    assert signup(c, "one-too-many").status_code == 429


@pytest.mark.parametrize("path", ["/notes", "/notes/1"])
def test_notes_require_auth(make_client, path):
    assert make_client().get(path).status_code == 401


def test_foreign_origin_rejected_on_mutation(make_client):
    c = make_client()
    resp = c.post(
        "/auth/signup",
        json={"username": "x", "password": "secret1"},
        headers={"Origin": "https://evil.example"},
    )
    assert resp.status_code == 403


def test_cors_allows_credentials_for_configured_origin(make_client):
    origin = settings.cors_origin_list[0]
    resp = make_client().options(
        "/auth/login",
        headers={"Origin": origin, "Access-Control-Request-Method": "POST"},
    )
    assert resp.headers["access-control-allow-origin"] == origin
    assert resp.headers["access-control-allow-credentials"] == "true"
