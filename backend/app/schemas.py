from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic_core import PydanticCustomError

PASSWORD_MIN = 6
PASSWORD_MAX = 128


def validate_password_length(v: str) -> str:
    """The password rule shared by signup and the set-password CLI."""
    if not PASSWORD_MIN <= len(v) <= PASSWORD_MAX:
        raise PydanticCustomError(
            "password_length",
            "Password must be between {min} and {max} characters",
            {"min": PASSWORD_MIN, "max": PASSWORD_MAX},
        )
    return v


NoteColor = Literal["blue", "red", "amber", "green", "yellow"]


class NoteCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = ""
    color: NoteColor | None = None
    is_public: bool = False


class NoteUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = None
    # Explicit null clears the label; omitting the field leaves it unchanged.
    color: NoteColor | None = None
    is_public: bool | None = None


class NoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    content: str
    color: NoteColor | None
    is_public: bool
    created_at: datetime
    updated_at: datetime


class SharedNoteRead(BaseModel):
    """A public note as seen by other users: the note plus the author's username, nothing more."""

    id: int
    title: str
    content: str
    color: NoteColor | None
    author: str
    created_at: datetime
    updated_at: datetime


class SharedNotePage(BaseModel):
    items: list[SharedNoteRead]
    total: int
    limit: int
    offset: int


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    is_admin: bool = False  # UI hint only; the API enforces admin access itself


class SignupRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str
    invite_code: str | None = Field(default=None, max_length=64)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, v: str) -> str:
        v = v.strip().lower()
        if not v:
            raise PydanticCustomError("username_empty", "Username is required")
        return v

    @field_validator("password")
    @classmethod
    def check_password_length(cls, v: str) -> str:
        return validate_password_length(v)


class LoginRequest(BaseModel):
    username: str = Field(max_length=50)
    password: str = Field(max_length=PASSWORD_MAX)


class AuthConfig(BaseModel):
    signup_mode: Literal["open", "invite", "closed"]


class InviteCreate(BaseModel):
    max_uses: int = Field(default=1, ge=1, le=100)
    expires_in_days: int = Field(default=7, ge=1, le=90)


class InviteRead(BaseModel):
    """An invite as listed to admins. Never includes the code itself (only its hash is stored)."""

    id: int
    created_by: str | None
    created_at: datetime
    expires_at: datetime
    max_uses: int
    use_count: int
    revoked: bool
    status: Literal["active", "used_up", "expired", "revoked"]


class InviteCreated(InviteRead):
    code: str  # plaintext, returned exactly once at creation


class DailyCount(BaseModel):
    date: str
    count: int


class AdminStats(BaseModel):
    users: int
    notes: int
    shared_notes: int
    signups_per_day: list[DailyCount]
