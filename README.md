# myapp — Notes

A simple notes app: create, list, edit and delete notes.

- `backend/` — FastAPI, SQLAlchemy, Alembic, Postgres (managed with [uv](https://docs.astral.sh/uv/))
- `frontend/` — React + Vite + TypeScript
- `docker-compose.yml` — Postgres + backend + frontend

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

Start only Postgres:

```bash
docker compose up db
```

Backend:

```bash
cd backend
uv sync
export DATABASE_URL=postgresql+psycopg://notes:<password>@localhost:5432/notes
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
VITE_API_BASE_URL=http://localhost:8000 npm run dev
```

`VITE_API_BASE_URL` sets the API base URL (defaults to `http://localhost:8000`).
The backend allows the origins in `CORS_ORIGINS` (default `http://localhost:5173`) with credentials.
For plain-http local runs outside Docker, also set `COOKIE_SECURE=false`.

## Theme and color labels

The UI is dark by default (the light/dark toggle remembers your choice in `localStorage`).
Colors are CSS variables in `frontend/src/index.css`: shadcn tokens plus five accents
(`info` blue, `danger` red, `warning` amber, `success` green, `highlight` yellow), each with a
`-tint` (callout background) and `-fg` (text-safe) variant, defined for both themes.
Contrast was checked against WCAG AA; that is why some `-fg` values and the primary/destructive
button text differ from the raw accent hue.

Each note can have an optional color label (`blue`, `red`, `amber`, `green`, `yellow`), stored in
the nullable `notes.color` column (migration `0004`, backward compatible). `PATCH` with
`"color": null` clears it. The notes page can filter by label.

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
password must be 6-128 characters). Passwords are hashed with argon2id.

- Sessions are stored server-side in Postgres (`sessions` table, keyed by a SHA-256
  of the token). The browser gets an `HttpOnly; Secure; SameSite=Lax` cookie named
  `session` that lasts 7 days; logout deletes the row.
- The frontend (`app.masnetsec.com`) and API (`api.masnetsec.com`) are same-site, so
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

## Checks

```bash
cd backend && uv run ruff check . && uv run ruff format --check . && uv run pytest
cd frontend && npm run lint && npm run build
```

Backend tests use in-memory SQLite, so no database is required. CI runs the same
checks on every pull request.

## Migrations

```bash
cd backend
uv run alembic revision --autogenerate -m "describe change"
uv run alembic upgrade head
```

## Deployment

Pushes to `main` (or a manual run of the **Deploy** workflow) deploy to production
at https://api.masnetsec.com. Everything is in `.github/workflows/deploy.yml` and `deploy/`.

0. The backend lint and tests must pass first; the deploy job `needs:` them.
1. GitHub Actions assumes the AWS role in the `AWS_ROLE_ARN` repo variable via OIDC
   (no stored AWS keys; the role only trusts `main`).
2. The backend is built for `linux/amd64` and pushed to the ECR repo `notes-backend`
   in `us-east-2`, tagged with the commit SHA. Tags are immutable, so there is no
   `latest`; a re-run of the same commit skips the push.
3. The workflow uses `aws ssm send-command` on the instance in `EC2_INSTANCE_ID` to
   download `deploy/deploy.sh` and `deploy/docker-compose.prod.yml` from
   raw.githubusercontent.com at that exact commit, then runs the script. It waits for
   the result, prints the output and fails the job if the deploy failed.
4. `deploy.sh` (as root on the instance) reads `/notes-app/db_password` and
   `/notes-app/tunnel_token` from SSM into `/opt/notes-app/.env` (mode 600), logs in
   to ECR, pulls, runs `alembic upgrade head`, runs `docker compose up -d`, polls
   `http://localhost:8000/health` for about 60s and finally prunes old images.

The push trigger only fires for changes under `backend/`, `deploy/` or `.github/workflows/deploy.yml`; to deploy anything else, run `gh workflow run deploy.yml --ref main`.

Production runs Postgres (named volume, no published ports), the backend (bound to
`127.0.0.1:8000`) and `cloudflared` (host network, routes the tunnel to the backend).
CORS allows only `https://app.masnetsec.com` (`CORS_ORIGINS` in the prod compose file).
Secrets live only in SSM; nothing sensitive is in the repo or workflow.

### Recovery and rollback

The default way to recover from a bad deploy is to **roll forward**: fix the problem
and merge a new commit, which deploys automatically.

Redeploying an older commit (`deploy.sh <sha> us-east-2` on the instance, with the
compose file in `/opt/notes-app`) is only safe if **no migrations were added since
that commit**. Migrations are never reverted, and an older image can't run
`alembic upgrade head` against a database that is at a newer revision (Alembic fails
with "Can't locate revision"), so the deploy aborts.

### Rotating the database password

Postgres only reads `POSTGRES_PASSWORD` when it first initializes the data volume.
Changing `/notes-app/db_password` in SSM afterwards makes the backend fail to
authenticate. To rotate, also change the password inside Postgres first, e.g.
`docker compose exec db psql -U notes -c "ALTER USER notes PASSWORD '<new>'"`, then
update the SSM parameter and redeploy.

## Configuration

See `.env.example`. Never commit a real `.env`.
