"""Admin CLI, run on the server.

    python -m app.cli make-admin USERNAME
    python -m app.cli set-password USERNAME

Granting admin is deliberately CLI-only; there is no API or UI for it. set-password prompts for the
new password (never an argument, so it cannot end up in shell history or the process list).
"""

import argparse
import getpass
import sys
from collections.abc import Callable

from pydantic_core import PydanticCustomError
from sqlalchemy import delete, select

from app.database import SessionLocal
from app.models import AuthSession, User
from app.schemas import validate_password_length
from app.security import hash_password

# Reads one secret from the terminal without echoing it: prompt_fn(prompt_text) -> str.
PromptFn = Callable[[str], str]


def make_admin(username: str) -> int:
    username = username.strip().lower()
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username == username))
        if user is None:
            print(f"error: no user named {username!r}", file=sys.stderr)
            return 1
        if user.is_admin:
            print(f"{username} is already an admin")
            return 0
        user.is_admin = True
        db.commit()
    print(f"{username} is now an admin")
    return 0


def set_password(username: str, prompt: PromptFn) -> int:
    """Set a user's password and sign them out everywhere by deleting their sessions."""
    username = username.strip().lower()
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username == username))
        if user is None:
            print(f"error: no user named {username!r}", file=sys.stderr)
            return 1

        password = prompt("New password: ")
        if prompt("Repeat new password: ") != password:
            print("error: passwords do not match; nothing changed", file=sys.stderr)
            return 1
        try:
            validate_password_length(password)  # same rule as signup
        except PydanticCustomError as e:
            print(f"error: {e.message()}; nothing changed", file=sys.stderr)
            return 1

        user.password_hash = hash_password(password)
        result = db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
        db.commit()
    print(f"Password updated for {username}; signed out {result.rowcount} session(s)")
    return 0


def _interactive_prompt(text: str) -> str:
    return getpass.getpass(text)


def main(argv: list[str] | None = None, prompt: PromptFn | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("make-admin", help="grant admin rights to an existing user")
    p.add_argument("username")
    p = sub.add_parser(
        "set-password",
        help="set a user's password (prompted, never an argument) and sign them out everywhere",
    )
    p.add_argument("username")
    args = parser.parse_args(argv)

    if args.command == "make-admin":
        return make_admin(args.username)
    if args.command == "set-password":
        if prompt is None:
            # Without a terminal getpass would echo the password, so refuse instead.
            if not sys.stdin.isatty():
                print(
                    "error: set-password needs an interactive terminal "
                    "(for docker, use `docker exec -it`)",
                    file=sys.stderr,
                )
                return 1
            prompt = _interactive_prompt
        return set_password(args.username, prompt)
    return 2


if __name__ == "__main__":
    sys.exit(main())
