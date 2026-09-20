# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Layout

- `backend/` — FastAPI + SQLAlchemy + Alembic + Postgres, managed with uv (Python 3.12)
- `frontend/` — React + Vite + TypeScript (npm, lint with oxlint); `wrangler.jsonc` deploys `dist/` as a Cloudflare Worker with static assets (SPA fallback, no Worker script)
- `docker-compose.yml` — local dev stack; `deploy/` — production stack and deploy script

## Commands

Backend (run in `backend/`):
```bash
uv sync
uv run ruff check . && uv run ruff format --check .
uv run pytest                                   # all tests
uv run pytest tests/test_notes.py::test_name    # single test
uv run alembic revision --autogenerate -m "msg"
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

Frontend (run in `frontend/`): `npm ci`, `npm run dev`, `npm run lint`, `npm run build` (runs `tsc -b` then Vite).

Local stack: `cp .env.example .env`, set a real `POSTGRES_PASSWORD` (keep it in sync with `DATABASE_URL`), then `docker compose up --build`. To run only Postgres: `docker compose up db`.

## Architecture notes

- Backend tests use in-memory SQLite by overriding the `get_db` dependency (`tests/conftest.py`), so no Postgres is needed. Avoid Postgres-only SQL in code paths the tests exercise.
- Settings come from env via `app/config.py`. `CORS_ORIGINS` is a comma-separated string; the backend image runs `alembic upgrade head` on every start.
- The frontend reads `VITE_API_BASE_URL`, which Vite bakes in at **build** time (default `http://localhost:8000`). Production builds need `https://api.masnetsec.com`.
- CI (`ci.yml`, PRs) runs backend ruff + pytest and frontend lint + build. Ruff line length is 100.

## Theme

- Dark by default with a light mode; palette and accent tokens live in `frontend/src/index.css` (`info`/`danger`/`warning`/`success`/`highlight`, each with `-tint` and `-fg`). Use those tokens and the `Callout`, `ColorBadge` and `Chip` components instead of ad-hoc colors.
- Keep text on WCAG AA: use the `-fg` variants for accent-colored text (raw dark-theme red `#e5484d` is only 4.3:1), and dark ink (not white) on filled dark-theme accents.
- Notes have an optional `color` label (`NoteColor` in `schemas.py` / `api.ts`); `PATCH` with `color: null` clears it while other omitted fields stay unchanged.

## Authentication

- Username + password only (6-128 chars, argon2id via `app/security.py`); no email. Routes are in `app/auth.py`; `CurrentUser` is the dependency that guards routes.
- Server-side sessions in Postgres. The cookie holds a random token; the `sessions` table stores its SHA-256. Cookie is `HttpOnly; Secure; SameSite=Lax`; `COOKIE_SECURE=false` only for local http (set in `docker-compose.yml`).
- Every note query must filter by `owner_id`; another user's note is a 404, never a 403., and `notes.owner_id` is `NOT NULL`: every note must be created with an owner.
- Sharing: `Note.is_public` (default false). `GET /notes/shared` is the only cross-user read; it excludes the caller's own notes, is ordered newest first, and must expose the author's username only (`SharedNoteRead`). It is declared before `/notes/{note_id}` on purpose. Never loosen `_get_or_404`: viewing/editing/deleting stays owner-only even for public notes.
- Login/signup rate limits live in the `auth_attempts` table; client IP comes from `CF-Connecting-IP`. Login errors must stay generic ("Invalid account or password").
- CORS uses `allow_credentials=True`, so `CORS_ORIGINS` must stay an explicit list (never `*`). Mutating requests with a non-allowed `Origin` get 403 (`reject_foreign_origins` in `app/main.py`).
- Tests: use the `client` fixture (already logged in as `alice`) or `make_client()` for independent cookie jars; the test base URL is https so the Secure cookie round-trips.
- Frontend uses `react-router` (v8; import from `react-router`, not `react-router-dom`). `api.ts` always sends `credentials: 'include'`; a 401 clears auth state and `ProtectedRoute` redirects to `/login`.

## Infrastructure & deployment

Every push to `main` triggers `.github/workflows/deploy.yml`, so merging deploys to production. Flow: backend tests, OIDC into AWS, build linux/amd64 image, push to ECR, then `aws ssm send-command` runs `deploy/deploy.sh` on the instance (it fetches the script and `deploy/docker-compose.prod.yml` from raw.githubusercontent.com at that commit SHA).

- **Workflow:** always work on a branch and open a PR; never push to `main`.
- **Region:** always `us-east-2`.
- **ECR:** backend images go to the private repo `notes-backend`. Tags are **immutable**: tag only with the git commit SHA, never `latest`. The workflow skips the build if the SHA tag already exists.
- **EC2 access:** the instance is reached only via SSM (Session Manager / send-command). No SSH keys and no inbound security group rules. Never suggest opening ports.
- **Secrets:** SSM Parameter Store SecureStrings under `/notes-app/` (`db_password`, `tunnel_token`). Never put secrets in the repo or workflows. `deploy.sh` writes them to `/opt/notes-app/.env` and rejects values containing single quotes or newlines.
- **GitHub → AWS auth:** OIDC, role in repo variable `AWS_ROLE_ARN`. This repo uses GitHub's immutable OIDC subject format: `repo:emass-sec@59150098/myapp@1376877369:ref:refs/heads/main`. Any new IAM trust policy must use that format.
- **GitHub Environments:** don't use them on the deploy job without also updating the role's trust policy.
- **API:** https://api.masnetsec.com, via a Cloudflare Tunnel (`cloudflared`, host network) to `127.0.0.1:8000` on the instance. Prod CORS is fixed to `https://app.masnetsec.com` in `deploy/docker-compose.prod.yml`.
- **Frontend:** a Cloudflare Worker with static assets (`frontend/wrangler.jsonc`) at https://app.masnetsec.com. `VITE_API_BASE_URL` is a build-time variable set in Cloudflare.
- **Migration 0002 wipes existing notes** (they had no owner) as it adds users and `notes.owner_id`. It runs on the first deploy that includes it.
- **Recovery:** roll forward with a new commit. Redeploying an older SHA is only safe if no Alembic migrations were added since. Postgres reads `POSTGRES_PASSWORD` only on first volume init, so rotating the SSM password needs `ALTER USER` first (see README).
