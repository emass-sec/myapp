from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic_core import PydanticCustomError

PASSWORD_MIN = 6
PASSWORD_MAX = 128


class NoteCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = ""


class NoteUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = None


class NoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    content: str
    created_at: datetime
    updated_at: datetime


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str


class SignupRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str

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
        if not PASSWORD_MIN <= len(v) <= PASSWORD_MAX:
            raise PydanticCustomError(
                "password_length",
                "Password must be between {min} and {max} characters",
                {"min": PASSWORD_MIN, "max": PASSWORD_MAX},
            )
        return v


class LoginRequest(BaseModel):
    username: str = Field(max_length=50)
    password: str = Field(max_length=PASSWORD_MAX)
