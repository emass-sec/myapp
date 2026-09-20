import pytest


def signup(c, username):
    resp = c.post("/auth/signup", json={"username": username, "password": "secret1"})
    assert resp.status_code == 201
    return c


@pytest.fixture
def bob(make_client):
    return signup(make_client(), "bob")


def make_note(c, title, **extra):
    resp = c.post("/notes", json={"title": title, "content": f"{title} body", **extra})
    assert resp.status_code == 201
    return resp.json()


def shared_titles(c):
    return [n["title"] for n in c.get("/notes/shared").json()["items"]]


def test_is_public_defaults_to_false(client):
    assert make_note(client, "x")["is_public"] is False


def test_other_user_can_list_public_note_with_author_only(client, bob):
    make_note(client, "open", is_public=True)
    page = bob.get("/notes/shared").json()
    assert page["total"] == 1
    (item,) = page["items"]
    assert item["title"] == "open" and item["content"] == "open body"
    assert item["author"] == "alice"
    # Nothing else about the author (or the note's internals) leaks.
    assert set(item) == {"id", "title", "content", "author", "created_at", "updated_at"}


def test_private_notes_are_not_visible_to_others(client, bob):
    private = make_note(client, "secret")
    make_note(client, "open", is_public=True)
    assert shared_titles(bob) == ["open"]
    assert bob.get(f"/notes/{private['id']}").status_code == 404


def test_public_note_is_read_only_for_others(client, bob):
    note = make_note(client, "open", is_public=True)
    assert bob.patch(f"/notes/{note['id']}", json={"title": "hacked"}).status_code == 404
    assert bob.patch(f"/notes/{note['id']}", json={"is_public": False}).status_code == 404
    assert bob.delete(f"/notes/{note['id']}").status_code == 404
    assert client.get(f"/notes/{note['id']}").json()["title"] == "open"
    assert shared_titles(bob) == ["open"]


def test_unsharing_hides_and_resharing_restores(client, bob):
    note = make_note(client, "open", is_public=True)
    assert shared_titles(bob) == ["open"]
    assert (
        client.patch(f"/notes/{note['id']}", json={"is_public": False}).json()["is_public"] is False
    )
    assert shared_titles(bob) == []
    assert (
        client.patch(f"/notes/{note['id']}", json={"is_public": True}).json()["is_public"] is True
    )
    assert shared_titles(bob) == ["open"]


def test_updating_other_fields_keeps_sharing(client, bob):
    note = make_note(client, "open", is_public=True)
    client.patch(f"/notes/{note['id']}", json={"title": "renamed"})
    assert shared_titles(bob) == ["renamed"]


def test_my_notes_list_stays_own_only(client, bob):
    make_note(client, "alice-public", is_public=True)
    make_note(bob, "bob-private")
    assert [n["title"] for n in bob.get("/notes").json()] == ["bob-private"]
    assert [n["title"] for n in client.get("/notes").json()] == ["alice-public"]


def test_own_public_notes_not_in_own_shared_feed(client):
    make_note(client, "mine", is_public=True)
    assert shared_titles(client) == []


def test_shared_feed_newest_first_and_paginated(client, bob):
    for i in range(5):
        make_note(client, f"n{i}", is_public=True)
    assert shared_titles(bob) == ["n4", "n3", "n2", "n1", "n0"]

    page = bob.get("/notes/shared", params={"limit": 2, "offset": 2}).json()
    assert [n["title"] for n in page["items"]] == ["n2", "n1"]
    assert (page["total"], page["limit"], page["offset"]) == (5, 2, 2)
    assert bob.get("/notes/shared", params={"offset": 10}).json()["items"] == []


@pytest.mark.parametrize("params", [{"limit": 0}, {"limit": 51}, {"offset": -1}])
def test_shared_pagination_bounds(bob, params):
    assert bob.get("/notes/shared", params=params).status_code == 422


def test_shared_requires_auth(make_client):
    assert make_client().get("/notes/shared").status_code == 401
