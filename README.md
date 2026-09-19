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
The backend allows the origins in `CORS_ORIGINS` (default `http://localhost:5173`).

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

Production runs Postgres (named volume, no published ports), the backend (bound to
`127.0.0.1:8000`) and `cloudflared` (host network, routes the tunnel to the backend).
CORS allows only `https://app.masnetsec.com` (`CORS_ORIGINS` in the prod compose file).
Secrets live only in SSM; nothing sensitive is in the repo or workflow.

To roll back, re-run the workflow from an older commit's SHA (or run `deploy.sh <sha>
us-east-2` on the instance with the compose file in `/opt/notes-app`). Note that
migrations are not reverted.

## Configuration

See `.env.example`. Never commit a real `.env`.
