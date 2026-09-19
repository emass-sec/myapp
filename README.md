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

## Configuration

See `.env.example`. Never commit a real `.env`.
