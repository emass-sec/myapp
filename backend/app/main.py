from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.auth import CurrentUser
from app.auth import router as auth_router
from app.config import settings
from app.database import get_db
from app.models import Note, User
from app.schemas import NoteCreate, NoteRead, NoteUpdate

DbSession = Annotated[Session, Depends(get_db)]

app = FastAPI(title="Notes API")

app.include_router(auth_router)

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


@app.middleware("http")
async def reject_foreign_origins(request: Request, call_next):
    """CSRF defence in depth: browsers always send Origin on cross-site mutating requests."""
    origin = request.headers.get("origin")
    if (
        request.method not in SAFE_METHODS
        and origin is not None
        and origin not in settings.cors_origin_list
    ):
        return JSONResponse({"detail": "Origin not allowed"}, status_code=403)
    return await call_next(request)


# Added after the origin check so CORS is outermost and also decorates its 403s.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health(db: DbSession) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


def _get_or_404(db: Session, note_id: int, user: User) -> Note:
    note = db.get(Note, note_id)
    # Other users' notes are indistinguishable from missing ones.
    if note is None or note.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    return note


@app.get("/notes", response_model=list[NoteRead])
def list_notes(db: DbSession, user: CurrentUser) -> list[Note]:
    return list(
        db.scalars(
            select(Note)
            .where(Note.owner_id == user.id)
            .order_by(Note.updated_at.desc(), Note.id.desc())
        )
    )


@app.post("/notes", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
def create_note(payload: NoteCreate, db: DbSession, user: CurrentUser) -> Note:
    note = Note(**payload.model_dump(), owner_id=user.id)
    db.add(note)
    db.commit()
    return note


@app.get("/notes/{note_id}", response_model=NoteRead)
def get_note(note_id: int, db: DbSession, user: CurrentUser) -> Note:
    return _get_or_404(db, note_id, user)


@app.patch("/notes/{note_id}", response_model=NoteRead)
def update_note(note_id: int, payload: NoteUpdate, db: DbSession, user: CurrentUser) -> Note:
    note = _get_or_404(db, note_id, user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(note, field, value)
    db.commit()
    return note


@app.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(note_id: int, db: DbSession, user: CurrentUser) -> Response:
    db.delete(_get_or_404(db, note_id, user))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
