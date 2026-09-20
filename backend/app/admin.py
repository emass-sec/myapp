from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import CurrentUser
from app.database import get_db
from app.invites import generate_code, hash_code
from app.models import InviteCode, Note, User
from app.schemas import (
    AdminStats,
    DailyCount,
    InviteCreate,
    InviteCreated,
    InviteRead,
)

DbSession = Annotated[Session, Depends(get_db)]


def require_admin(user: CurrentUser) -> User:
    # is_admin is read from the database on every request, so removing it takes effect at once.
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user


AdminUser = Annotated[User, Depends(require_admin)]

# Every route on this router requires an admin. Do not add routes elsewhere under /admin.
router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])

STATS_DAYS = 30


def _aware(dt: datetime) -> datetime:
    # SQLite (used in tests) returns naive datetimes; treat them as UTC.
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def _invite_read(invite: InviteCode, creator: str | None) -> InviteRead:
    if invite.revoked:
        state = "revoked"
    elif _aware(invite.expires_at) <= datetime.now(UTC):
        state = "expired"
    elif invite.use_count >= invite.max_uses:
        state = "used_up"
    else:
        state = "active"
    return InviteRead(
        id=invite.id,
        created_by=creator,
        created_at=invite.created_at,
        expires_at=invite.expires_at,
        max_uses=invite.max_uses,
        use_count=invite.use_count,
        revoked=invite.revoked,
        status=state,
    )


@router.post("/invites", response_model=InviteCreated, status_code=status.HTTP_201_CREATED)
def create_invite(payload: InviteCreate, db: DbSession, admin: AdminUser) -> InviteCreated:
    code = generate_code()
    invite = InviteCode(
        code_hash=hash_code(code),
        created_by=admin.id,
        expires_at=datetime.now(UTC) + timedelta(days=payload.expires_in_days),
        max_uses=payload.max_uses,
    )
    db.add(invite)
    db.commit()
    # The plaintext is only available here; only its hash is stored.
    return InviteCreated(**_invite_read(invite, admin.username).model_dump(), code=code)


@router.get("/invites", response_model=list[InviteRead])
def list_invites(db: DbSession) -> list[InviteRead]:
    rows = db.execute(
        select(InviteCode, User.username)
        .outerjoin(User, User.id == InviteCode.created_by)
        .order_by(InviteCode.created_at.desc(), InviteCode.id.desc())
    ).all()
    return [_invite_read(invite, username) for invite, username in rows]


@router.post("/invites/{invite_id}/revoke", response_model=InviteRead)
def revoke_invite(invite_id: int, db: DbSession) -> InviteRead:
    invite = db.get(InviteCode, invite_id)
    if invite is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invite not found")
    invite.revoked = True
    db.commit()
    creator = db.get(User, invite.created_by).username if invite.created_by else None
    return _invite_read(invite, creator)


@router.get("/stats", response_model=AdminStats)
def stats(db: DbSession) -> AdminStats:
    today = datetime.now(UTC).date()
    days = [today - timedelta(days=i) for i in range(STATS_DAYS - 1, -1, -1)]
    since = datetime.combine(days[0], datetime.min.time(), tzinfo=UTC)
    created = db.scalars(select(User.created_at).where(User.created_at >= since)).all()
    per_day = dict.fromkeys(days, 0)
    for ts in created:
        day = _aware(ts).astimezone(UTC).date()
        if day in per_day:
            per_day[day] += 1
    return AdminStats(
        users=db.scalar(select(func.count()).select_from(User)) or 0,
        notes=db.scalar(select(func.count()).select_from(Note)) or 0,
        shared_notes=db.scalar(
            select(func.count()).select_from(Note).where(Note.is_public.is_(True))
        )
        or 0,
        signups_per_day=[DailyCount(date=d.isoformat(), count=n) for d, n in per_day.items()],
    )
