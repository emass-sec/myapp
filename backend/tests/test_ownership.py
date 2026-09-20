def signup(c, username):
    assert (
        c.post("/auth/signup", json={"username": username, "password": "secret1"}).status_code
        == 201
    )


def test_user_cannot_access_another_users_note(client, make_client):
    note = client.post("/notes", json={"title": "alice's", "content": "private"}).json()

    bob = make_client()
    signup(bob, "bob")
    assert bob.get(f"/notes/{note['id']}").status_code == 404
    assert bob.patch(f"/notes/{note['id']}", json={"title": "hacked"}).status_code == 404
    assert bob.delete(f"/notes/{note['id']}").status_code == 404

    # Untouched for the owner.
    assert client.get(f"/notes/{note['id']}").json()["title"] == "alice's"


def test_list_only_returns_own_notes(client, make_client):
    client.post("/notes", json={"title": "A1"})
    bob = make_client()
    signup(bob, "bob")
    bob.post("/notes", json={"title": "B1"})

    assert [n["title"] for n in client.get("/notes").json()] == ["A1"]
    assert [n["title"] for n in bob.get("/notes").json()] == ["B1"]


def test_new_notes_are_owned_by_creator(client):
    from app.database import get_db
    from app.main import app
    from app.models import Note

    client.post("/notes", json={"title": "mine"})
    db = next(app.dependency_overrides[get_db]())
    note = db.query(Note).one()
    assert note.owner_id == client.get("/auth/me").json()["id"]


def test_owner_id_cannot_be_set_by_client(client, make_client):
    bob = make_client()
    signup(bob, "bob")
    bob_id = bob.get("/auth/me").json()["id"]
    note = client.post("/notes", json={"title": "x", "owner_id": bob_id}).json()
    assert bob.get(f"/notes/{note['id']}").status_code == 404
