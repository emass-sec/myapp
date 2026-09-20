# Deployment

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
in `deploy/docker-compose.prod.yml`. Replace the example domains in these docs, that file and your
Cloudflare configuration with your own.
Secrets live only in SSM; nothing sensitive is in the repo or workflow.

## Recovery and rollback

The default way to recover from a bad deploy is to **roll forward**: fix the problem
and merge a new commit, which deploys automatically.

Redeploying an older commit (`deploy.sh <sha> us-east-2` on the instance, with the
compose file in `/opt/notes-app`) is only safe if **no migrations were added since
that commit**. Migrations are never reverted, and an older image can't run
`alembic upgrade head` against a database that is at a newer revision (Alembic fails
with "Can't locate revision"), so the deploy aborts.

## Rotating the database password

Postgres only reads `POSTGRES_PASSWORD` when it first initializes the data volume.
Changing `/notes-app/db_password` in SSM afterwards makes the backend fail to
authenticate. To rotate, also change the password inside Postgres first, e.g.
`docker compose exec db psql -U notes -c "ALTER USER notes PASSWORD '<new>'"`, then
update the SSM parameter and redeploy.

## Granting admin in production (via SSM)

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

## Resetting a user's password in production (via SSM)

`set-password` prompts for the new password twice, so it needs an interactive terminal: use a
Session Manager shell, not `aws ssm send-command` (which has no terminal; the command refuses to run
without one rather than echo the password). The password is never a command-line argument.

```bash
IID=$(gh variable get EC2_INSTANCE_ID)
aws ssm start-session --region us-east-2 --target "$IID"
```

Then, in the session:

```bash
sudo docker exec -it notes-app-backend-1 python -m app.cli set-password USERNAME
```

`notes-app-backend-1` is the backend container of the `notes-app` Compose project; confirm the name
with `sudo docker ps --format '{{.Names}}'`. The command applies the same rules as signup (6-128
characters), hashes the password with argon2id, and deletes that user's sessions so they are signed
out everywhere. Other users are unaffected.

