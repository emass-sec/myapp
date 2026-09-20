from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.invites import consume_invite
from app.models import AuthAttempt, AuthSession, User
from app.schemas import AuthConfig, LoginRequest, SignupRequest, UserRead
from app.security import hash_password, hash_token, new_session_token, verify_password

COOKIE_NAME = "session"
INVALID_LOGIN = "Invalid account or password"
INVALID_INVITE = "Invalid invite code"  # same for unknown, expired, revoked and used-up codes

router = APIRouter(prefix="/auth", tags=["auth"])
DbSession = Annotated[Session, Depends(get_db)]


def _now() -> datetime:
    return datetime.now(UTC)


def client_ip(request: Request) -> str:
    # The API is only reachable through the Cloudflare Tunnel, which sets this header.
    return request.headers.get("cf-connecting-ip") or (
        request.client.host if request.client else "unknown"
    )


def _too_many(retry_after_seconds: int) -> HTTPException:
    return HTTPException(
        status.HTTP_429_TOO_MANY_REQUESTS,
        "Too many attempts. Please try again later.",
        headers={"Retry-After": str(retry_after_seconds)},
    )


def _attempts_since(db: Session, kind: str, ip: str, since: datetime, username: str | None = None):
    q = (
        select(func.count())
        .select_from(AuthAttempt)
        .where(AuthAttempt.kind == kind, AuthAttempt.ip == ip, AuthAttempt.created_at > since)
    )
    if username is not None:
        q = q.where(AuthAttempt.username == username)
    return db.scalar(q) or 0


def _start_session(db: Session, response: Response, user: User) -> None:
    token = new_session_token()
    expires = _now() + timedelta(days=settings.session_days)
    db.add(AuthSession(id=hash_token(token), user_id=user.id, expires_at=expires))
    db.commit()
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=settings.session_days * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def get_current_user(
    db: DbSession, session_token: Annotated[str | None, Cookie(alias=COOKIE_NAME)] = None
) -> User:
    if session_token:
        user = db.scalar(
            select(User)
            .join(AuthSession, AuthSession.user_id == User.id)
            .where(AuthSession.id == hash_token(session_token), AuthSession.expires_at > _now())
        )
        if user is not None:
            return user
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")


CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get("/config", response_model=AuthConfig)
def auth_config() -> AuthConfig:
    return AuthConfig(signup_mode=settings.signup_mode)


@router.post("/signup", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, request: Request, response: Response, db: DbSession) -> User:
    if settings.signup_mode == "closed":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Signups are closed")

    ip = client_ip(request)
    window = _now() - timedelta(hours=1)
    if _attempts_since(db, "signup", ip, window) >= settings.signup_max_per_hour:
        raise _too_many(3600)
    db.add(AuthAttempt(kind="signup", ip=ip, username=payload.username))
    db.commit()  # counted even if the code is wrong or the username turns out to be taken

    # Hash first so the invite row isn't locked while argon2 runs.
    user = User(username=payload.username, password_hash=hash_password(payload.password))

    if settings.signup_mode == "invite":
        # Consume before inserting the user: probing usernames requires a valid code, and a
        # username conflict below rolls the consumption back (same transaction).
        if not payload.invite_code or not consume_invite(db, payload.invite_code):
            db.rollback()
            raise HTTPException(status.HTTP_403_FORBIDDEN, INVALID_INVITE)

    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Username is already taken") from None
    _start_session(db, response, user)
    return user


@router.post("/login", response_model=UserRead)
def login(payload: LoginRequest, request: Request, response: Response, db: DbSession) -> User:
    ip = client_ip(request)
    username = payload.username.strip().lower()
    window_seconds = settings.login_window_minutes * 60
    since = _now() - timedelta(seconds=window_seconds)
    if _attempts_since(db, "login", ip, since, username) >= settings.login_max_failures:
        raise _too_many(window_seconds)

    user = db.scalar(select(User).where(User.username == username))
    if not verify_password(user.password_hash if user else None, payload.password) or user is None:
        db.add(AuthAttempt(kind="login", ip=ip, username=username))
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, INVALID_LOGIN)

    db.execute(
        delete(AuthAttempt).where(
            AuthAttempt.kind == "login", AuthAttempt.ip == ip, AuthAttempt.username == username
        )
    )
    # Opportunistic cleanup of stale attempts and sessions.
    db.execute(delete(AuthAttempt).where(AuthAttempt.created_at < _now() - timedelta(days=1)))
    db.execute(delete(AuthSession).where(AuthSession.expires_at < _now()))
    _start_session(db, response, user)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    db: DbSession,
    session_token: Annotated[str | None, Cookie(alias=COOKIE_NAME)] = None,
) -> Response:
    if session_token:
        db.execute(delete(AuthSession).where(AuthSession.id == hash_token(session_token)))
        db.commit()
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(
        COOKIE_NAME,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )
    return response


@router.get("/me", response_model=UserRead)
def me(user: CurrentUser) -> User:
    return user
