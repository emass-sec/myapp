def test_create_and_get(client):
    resp = client.post("/notes", json={"title": "Hello", "content": "World"})
    assert resp.status_code == 201
    note = resp.json()
    assert note["title"] == "Hello"
    assert client.get(f"/notes/{note['id']}").json()["content"] == "World"


def test_list(client):
    client.post("/notes", json={"title": "A"})
    client.post("/notes", json={"title": "B"})
    titles = {n["title"] for n in client.get("/notes").json()}
    assert titles == {"A", "B"}


def test_update(client):
    note_id = client.post("/notes", json={"title": "Old", "content": "keep"}).json()["id"]
    resp = client.patch(f"/notes/{note_id}", json={"title": "New"})
    assert resp.status_code == 200
    assert resp.json()["title"] == "New"
    assert resp.json()["content"] == "keep"


def test_delete(client):
    note_id = client.post("/notes", json={"title": "Bye"}).json()["id"]
    assert client.delete(f"/notes/{note_id}").status_code == 204
    assert client.get(f"/notes/{note_id}").status_code == 404


def test_not_found(client):
    assert client.get("/notes/999").status_code == 404
    assert client.patch("/notes/999", json={"title": "x"}).status_code == 404
    assert client.delete("/notes/999").status_code == 404


def test_empty_title_rejected(client):
    assert client.post("/notes", json={"title": ""}).status_code == 422
