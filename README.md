# myapp — Notes

A simple notes app: create, list, edit and share notes.

Built with FastAPI, SQLAlchemy and PostgreSQL (backend), React, Vite and Tailwind CSS (frontend), and deployed with Docker Compose, AWS (EC2 via SSM, ECR), Cloudflare and GitHub Actions.

## Quick start (Docker)

```bash
cp .env.example .env      # then set a real POSTGRES_PASSWORD (keep it in sync with DATABASE_URL)
docker compose up --build
```

- Frontend: http://localhost:5173
- API docs: http://localhost:8000/docs
- Health: http://localhost:8000/health

The backend container runs `alembic upgrade head` on start.

## Local development (without Docker for the apps)

Run only Postgres in Docker, and the apps directly:

```bash
docker compose up db        # terminal 1: Postgres only
cd backend && uv sync && uv run alembic upgrade head && uv run uvicorn app.main:app --reload   # terminal 2
cd frontend && npm install && npm run dev                                                      # terminal 3
```

The backend needs `DATABASE_URL` (see `.env.example`) and, for plain-http runs outside Docker,
`COOKIE_SECURE=false`. The frontend reads `VITE_API_BASE_URL`. Details: [development](docs/development.md).

## Sharing notes

Owners can mark a note public. Every signed-in user can read public notes in a read-only
"Shared with everyone" section (`GET /notes/shared`, newest first, author username only); editing
and deleting stay owner-only. Details: [architecture](docs/architecture.md#sharing-notes).

## Accounts and authentication

Sign up with just a username and password (6-128 characters, no email), hashed with argon2id.
Sessions are stored server-side in Postgres and sent in an `HttpOnly; Secure; SameSite=Lax` cookie.
Every note has an owner and other users' notes return 404; logins are rate-limited and errors are
generic. Details: [architecture](docs/architecture.md#accounts-and-authentication).

## Signup modes, invites and admins

`SIGNUP_MODE` is `open`, `invite` or `closed` (production uses `invite`). Admins create invite codes
like `K7MQ-3XWD`: single-use by default, expiring after 7 days, stored only as a hash. Admin rights
are granted from the command line only (`python -m app.cli make-admin USERNAME`; in production via
SSM). Details: [architecture](docs/architecture.md#signup-modes-invites-and-admins) and
[deployment](docs/deployment.md#granting-admin-in-production-via-ssm).

## Checks

```bash
cd backend && uv run ruff check . && uv run ruff format --check . && uv run pytest
cd frontend && npm run lint && npm run build
```

Backend tests use in-memory SQLite, so no database is required. CI runs the same checks on every
pull request.

## Migrations

Alembic migrations run automatically when the backend container starts and on every deploy. Create
one with `cd backend && uv run alembic revision --autogenerate -m "describe change"`.
Details: [development](docs/development.md#migrations).

## Deployment

Pushes to `main` that touch `backend/`, `deploy/` or the deploy workflow (or a manual
`gh workflow run deploy.yml --ref main`) deploy to production: GitHub Actions runs the tests, builds
an image tagged with the commit SHA into ECR, and runs the deploy script on the EC2 instance over
SSM (OIDC, no stored AWS keys, no SSH). Recover from a bad deploy by rolling forward with a new
commit. Details: [deployment](docs/deployment.md).

## Documentation

- [Architecture](docs/architecture.md): repository layout, tech stack, request flow, accounts and
  authentication, sharing, signup modes, invites and admins
- [Deployment](docs/deployment.md): the deploy pipeline, recovery and rollback, rotating the database
  password, granting admin in production
- [Theming](docs/theming.md): theme colors, note color labels and how to change them
- [Development](docs/development.md): running without Docker, checks, migrations, configuration
