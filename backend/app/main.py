from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Note
from app.schemas import NoteCreate, NoteRead, NoteUpdate

DbSession = Annotated[Session, Depends(get_db)]

app = FastAPI(title="Notes API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health(db: DbSession) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


def _get_or_404(db: Session, note_id: int) -> Note:
    note = db.get(Note, note_id)
    if note is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    return note


@app.get("/notes", response_model=list[NoteRead])
def list_notes(db: DbSession) -> list[Note]:
    return list(db.scalars(select(Note).order_by(Note.updated_at.desc(), Note.id.desc())))


@app.post("/notes", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
def create_note(payload: NoteCreate, db: DbSession) -> Note:
    note = Note(**payload.model_dump())
    db.add(note)
    db.commit()
    return note


@app.get("/notes/{note_id}", response_model=NoteRead)
def get_note(note_id: int, db: DbSession) -> Note:
    return _get_or_404(db, note_id)


@app.patch("/notes/{note_id}", response_model=NoteRead)
def update_note(note_id: int, payload: NoteUpdate, db: DbSession) -> Note:
    note = _get_or_404(db, note_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(note, field, value)
    db.commit()
    return note


@app.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(note_id: int, db: DbSession) -> Response:
    db.delete(_get_or_404(db, note_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
