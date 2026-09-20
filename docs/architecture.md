# Architecture

How the app is put together. See also [deployment](deployment.md), [theming](theming.md) and
[development](development.md).

## Repository layout

- `backend/` — FastAPI, SQLAlchemy, Alembic, Postgres (managed with [uv](https://docs.astral.sh/uv/))
- `frontend/` — React + Vite + TypeScript
- `docker-compose.yml` — Postgres + backend + frontend

## Tech stack

| Layer | Technology | Where |
|---|---|---|
| **Backend** | [FastAPI](https://fastapi.tiangolo.com/) (served by uvicorn), Pydantic | `backend/app/` (`main.py` notes routes, `auth.py`, `admin.py`, `schemas.py`, `config.py`) |
| | [SQLAlchemy](https://www.sqlalchemy.org/) 2 ORM with psycopg 3 | `backend/app/models.py`, `backend/app/database.py` |
| | [Alembic](https://alembic.sqlalchemy.org/) migrations | `backend/alembic/versions/` |
| | [PostgreSQL](https://www.postgresql.org/) 17 | `postgres:17-alpine` in `docker-compose.yml` and `deploy/docker-compose.prod.yml` |
| | [uv](https://docs.astral.sh/uv/) (dependencies, virtualenv) | `backend/pyproject.toml`, `backend/uv.lock` |
| | argon2 password hashing | `backend/app/security.py` |
| | [pytest](https://docs.pytest.org/) (in-memory SQLite, `httpx` test client) | `backend/tests/` |
| | [Ruff](https://docs.astral.sh/ruff/) (lint + format) | `[tool.ruff]` in `backend/pyproject.toml` |
| **Frontend** | [React](https://react.dev/) 19, [Vite](https://vite.dev/) 8, TypeScript 7 | `frontend/src/`, `frontend/vite.config.ts` |
| | [React Router](https://reactrouter.com/) 8 (`react-router` package) | routes in `frontend/src/App.tsx`, pages in `frontend/src/pages/` |
| | [Tailwind CSS](https://tailwindcss.com/) 4 (via `@tailwindcss/vite`) | `frontend/src/index.css` |
| | [shadcn/ui](https://ui.shadcn.com/) components (Radix UI primitives) | `frontend/src/components/ui/`, config in `frontend/components.json` |
| | [lucide-react](https://lucide.dev/) icons | imported per component |
| | [Sonner](https://sonner.emilkowal.ski/) toasts | `frontend/src/components/ui/sonner.tsx`, `<Toaster>` in `App.tsx` |
| | [oxlint](https://oxc.rs/docs/guide/usage/linter) | `frontend/.oxlintrc.json` (`npm run lint`) |
| | Inter and JetBrains Mono fonts (self-hosted via Fontsource) | imported in `frontend/src/index.css` |
| **Infrastructure** | Docker Compose (local dev stack; production stack) | `docker-compose.yml`, `deploy/docker-compose.prod.yml` |
| | AWS EC2, reached only through SSM (no SSH) | `deploy/deploy.sh`, run by `aws ssm send-command` from `.github/workflows/deploy.yml` |
| | Amazon ECR (backend images tagged with the commit SHA) | `.github/workflows/deploy.yml`, `backend/Dockerfile` |
| | Cloudflare Tunnel (`cloudflared`) exposing the API | `cloudflared` service in `deploy/docker-compose.prod.yml` |
| | Cloudflare Workers with static assets (frontend) | `frontend/wrangler.jsonc` (serves `frontend/dist`, SPA fallback) |
| | GitHub Actions with AWS OIDC (no stored AWS keys) | `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`; Dependabot in `.github/dependabot.yml` |

The local Docker setup serves the built frontend with nginx (`frontend/Dockerfile`,
`frontend/nginx.conf`); in production the frontend runs on Cloudflare Workers instead.

## Request flow

1. The browser loads the React single-page app: from Cloudflare Workers static assets in
   production, from nginx in the local Docker setup.
2. The app calls the API (a separate host on the same site) with `credentials: 'include'`, so the
   `session` cookie travels with every request (see [Accounts and authentication](#accounts-and-authentication)).
3. In production the request reaches the backend through the Cloudflare Tunnel (`cloudflared`,
   forwarding to `127.0.0.1:8000` on the server); locally it goes straight to port 8000.
4. The backend answers CORS only for the origins in `CORS_ORIGINS` and rejects mutating requests
   from any other `Origin`, looks up the session in Postgres, filters note queries by owner (the
   shared-notes feed is the one deliberate exception), and reads or writes Postgres through SQLAlchemy.

## Sharing notes

An owner can mark a note public (`is_public`, default `false`; set on create or `PATCH`). Public
notes are readable by every signed-in user, and only there:

- `GET /notes/shared?limit=20&offset=0` returns other users' public notes, newest first
  (`limit` 1-50), as `{items, total, limit, offset}`. Each item has `id`, `title`, `content`,
  `color` (the note's label, or `null`), `author` (username only) and timestamps; no other user data.
- `GET /notes` still returns only your own notes, and `GET/PATCH/DELETE /notes/{id}` are strictly
  owner-only (another user's note, public or not, is a 404). Unsharing hides a note immediately.
- The UI has a "Share with all users" switch in the note dialog, a "Shared" badge on your public
  notes, and a read-only "Shared with everyone" section below your notes.
- Migration `0005` adds `notes.is_public BOOLEAN NOT NULL DEFAULT false`, so the previous app
  version keeps working during a rollout.

## Accounts and authentication

Users sign up with just a username and password (no email or personal details; the
password must be 6-128 characters), subject to the signup mode below. Passwords are hashed with argon2id.

- Sessions are stored server-side in Postgres (`sessions` table, keyed by a SHA-256
  of the token). The browser gets an `HttpOnly; Secure; SameSite=Lax` cookie named
  `session` that lasts 7 days; logout deletes the row.
- The frontend (for example `app.example.com`) and API (`api.example.com`) are same-site, so
  the frontend calls the API with `credentials: 'include'` and the backend answers with
  `allow_credentials` and explicit `CORS_ORIGINS` only. Mutating requests from any other
  `Origin` are rejected with 403.
- Every note has an owner and users only see their own notes, plus notes other users have chosen to share publicly (see [Sharing notes](#sharing-notes)). Opening, editing or deleting another user's note by ID always returns 404, even if it is public.
- Login failures return a generic "Invalid account or password". Logins are limited to
  5 failures per 10 minutes per (IP, username) and signups to 10 per hour per IP (HTTP 429),
  tracked in the `auth_attempts` table.
- `COOKIE_SECURE` (default `true`) is set to `false` only in the local `docker-compose.yml`,
  because local development uses plain http. Behind Cloudflare the client IP is read from
  `CF-Connecting-IP`.
- Frontend routes: `/login`, `/signup`, and `/` (notes, redirects to `/login` when signed
  out and returns to the page you asked for after login).

`notes.owner_id` is `NOT NULL`. Migration `0003` fails (without deleting anything) if any
ownerless note exists.

## Signup modes, invites and admins

`SIGNUP_MODE` controls who can create accounts:

| Mode | Behavior |
|---|---|
| `open` | Anyone can sign up (the default in `.env.example` and the local `docker-compose.yml`). |
| `invite` | Signup requires a valid invite code. Production uses this (`deploy/docker-compose.prod.yml`); it is also the code default if the variable is unset. |
| `closed` | No signups (403). Existing users can still log in. |

`GET /auth/config` reports the mode so the signup page can show or hide the invite field.

**Invite codes** look like `K7MQ-3XWD` (8 characters from a CSPRNG, without `0/O/1/I/L`; entry
ignores case and dashes). Only the SHA-256 of a code is stored, so the plaintext is shown exactly
once, when an admin creates it. Each code has an expiry (default 7 days) and a use limit (default 1).
Redemption is a single atomic `UPDATE ... WHERE use_count < max_uses AND NOT revoked AND
expires_at > now`, so concurrent signups can never exceed the limit, and it happens in the same
transaction as creating the user (a taken username does not burn a use). Every failure (unknown,
expired, revoked, used up, missing) returns the same `403 Invalid invite code`.

**Admins** (`users.is_admin`) can use the `/admin` page and API: create, list and revoke invites, and
see stats (users, notes, shared notes, signups per day for the last 30 days). Non-admins get 403 from
every `/admin/*` endpoint (the frontend only hides the link; the API is the security boundary).
Admin rights can only be granted from the command line on the server, never through the API or UI:

```bash
python -m app.cli make-admin USERNAME     # the user must already exist
```

Locally: `docker compose exec backend python -m app.cli make-admin USERNAME`.

Production admin setup runs through SSM; see
[Granting admin in production](deployment.md#granting-admin-in-production-via-ssm).
