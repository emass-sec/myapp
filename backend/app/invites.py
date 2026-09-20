import hashlib
import re
import secrets
from datetime import UTC, datetime

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import InviteCode

# No 0/O, 1/I/L: characters people misread or mistype.
ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 8


def generate_code() -> str:
    """A random code like 'K7MQ-3XWD' from the OS CSPRNG."""
    raw = "".join(secrets.choice(ALPHABET) for _ in range(CODE_LENGTH))
    return f"{raw[:4]}-{raw[4:]}"


def normalize_code(code: str) -> str:
    """Ignore case, dashes and spaces so codes can be typed or pasted loosely."""
    return re.sub(r"[\s-]", "", code).upper()


def hash_code(code: str) -> str:
    return hashlib.sha256(normalize_code(code).encode()).hexdigest()


def consume_invite(db: Session, code: str) -> bool:
    """Redeem one use of `code`; True if it was valid.

    A single UPDATE both checks and increments, so concurrent redemptions cannot exceed
    `max_uses`. It does not commit: the caller commits together with creating the user, so a
    failure there rolls the use back.
    """
    result = db.execute(
        update(InviteCode)
        .where(
            InviteCode.code_hash == hash_code(code),
            InviteCode.revoked.is_(False),
            InviteCode.use_count < InviteCode.max_uses,
            InviteCode.expires_at > datetime.now(UTC),
        )
        .values(use_count=InviteCode.use_count + 1)
        .returning(InviteCode.id)
    )
    return result.first() is not None
