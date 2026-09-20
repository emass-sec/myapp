"""Admin CLI. Usage: python -m app.cli make-admin USERNAME

Granting admin is deliberately CLI-only (run on the server); there is no API or UI for it.
"""

import argparse
import sys

from sqlalchemy import select

from app.database import SessionLocal
from app.models import User


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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("make-admin", help="grant admin rights to an existing user")
    p.add_argument("username")
    args = parser.parse_args(argv)
    if args.command == "make-admin":
        return make_admin(args.username)
    return 2


if __name__ == "__main__":
    sys.exit(main())
