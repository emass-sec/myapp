# myapp — Notes

A simple notes app: create, list, edit and share notes.

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

### Changing theme colors

All colors are CSS variables in **`frontend/src/index.css`**:

- `:root { ... }` holds the light theme and `.dark { ... }` the dark theme (dark is the default).
  Edit the values there; nothing else needs to change.
- The variables are the shadcn tokens (`--background`, `--card`, `--border`, `--primary`, ...) plus
  the accents `--info` (blue), `--danger` (red), `--warning` (amber), `--success` (green) and
  `--highlight` (yellow). Each accent has a `-tint` (callout background) and an `-fg` (text-safe
  color) variant.
- The `@theme inline { ... }` block maps the variables to Tailwind utilities (for example
  `--color-info` becomes `bg-info`, `text-info-fg`, `border-info`), so components use the names,
  never raw hex values.
- Note color labels use these accents: the class mapping is in `frontend/src/lib/note-colors.ts`,
  and the card left border and hover glow are the `.note-card` rules at the bottom of `index.css`.
- After changing colors, re-check WCAG AA contrast (see [Theme and color labels](#theme-and-color-labels)).

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

### Granting admin in production (via SSM)

The instance has no SSH, so run the command through SSM (region `us-east-2`; the instance ID is the
`EC2_INSTANCE_ID` repository variable):

```bash
IID=$(gh variable get EC2_INSTANCE_ID)
CMD=$(aws ssm send-command --region us-east-2 --instance-ids "$IID" \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["cd /opt/notes-app && docker compose --env-file .env -f docker-compose.prod.yml exec -T backend python -m app.cli make-admin USERNAME"]' \
  --query Command.CommandId --output text)
aws ssm get-command-invocation --region us-east-2 --command-id "$CMD" --instance-id "$IID" \
  --query '[Status,StandardOutputContent,StandardErrorContent]' --output text
```

(Replace `USERNAME`; or open a shell with `aws ssm start-session --target "$IID"` and run the
`docker compose ... exec` line there.) With `SIGNUP_MODE=invite` and no admin nobody can create
invites, so after deploying this feature make yourself admin first, then create an invite at
`https://app.example.com/admin` and share the link `https://app.example.com/signup?invite=CODE`.

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
at your API host (for example https://api.example.com). Everything is in `.github/workflows/deploy.yml` and `deploy/`.

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
CORS allows only your frontend origin (for example `https://app.example.com`), set as `CORS_ORIGINS`
in `deploy/docker-compose.prod.yml`. Replace the example domains in this README, that file and your
Cloudflare configuration with your own.
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
