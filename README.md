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

## Documentation

- [Architecture](docs/architecture.md): repository layout, tech stack, request flow, accounts and
  authentication, sharing, signup modes, invites and admins
- [Deployment](docs/deployment.md): the deploy pipeline, recovery and rollback, rotating the database
  password, granting admin in production
- [Theming](docs/theming.md): theme colors, note color labels and how to change them
- [Development](docs/development.md): running without Docker, checks, migrations, configuration
