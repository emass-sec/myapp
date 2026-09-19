#!/usr/bin/env bash
# Deploy the notes stack on the EC2 host. Run as root:
#   deploy.sh <IMAGE_TAG> <AWS_REGION>
# Expects docker-compose.prod.yml next to this script (or in /opt/notes-app).
set -euo pipefail

IMAGE_TAG="${1:?usage: deploy.sh <IMAGE_TAG> <AWS_REGION>}"
REGION="${2:?usage: deploy.sh <IMAGE_TAG> <AWS_REGION>}"

APP_DIR=/opt/notes-app
COMPOSE_FILE="$APP_DIR/docker-compose.prod.yml"
ENV_FILE="$APP_DIR/.env"

# SSM RunCommand may not set HOME; docker and aws need it.
export HOME="${HOME:-/root}"
export AWS_DEFAULT_REGION="$REGION"

if [[ ! "$IMAGE_TAG" =~ ^[0-9a-f]{40}$ ]]; then
  echo "IMAGE_TAG must be a 40-char git commit SHA, got: $IMAGE_TAG" >&2
  exit 1
fi

mkdir -p "$APP_DIR"
cd "$APP_DIR"
[[ -f "$COMPOSE_FILE" ]] || { echo "missing $COMPOSE_FILE" >&2; exit 1; }

get_param() {
  aws ssm get-parameter --region "$REGION" --with-decryption \
    --name "$1" --query Parameter.Value --output text
}

echo "==> Reading configuration from SSM"
DB_PASSWORD="$(get_param /notes-app/db_password)"
TUNNEL_TOKEN="$(get_param /notes-app/tunnel_token)"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
ECR_REGISTRY="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

# Values are written single-quoted so compose does not interpolate them.
for v in "$DB_PASSWORD" "$TUNNEL_TOKEN"; do
  if [[ "$v" == *"'"* || "$v" == *$'\n'* ]]; then
    echo "SSM secrets must not contain single quotes or newlines" >&2
    exit 1
  fi
done
DB_PASSWORD_URLENC="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$DB_PASSWORD")"

umask 077
cat > "$ENV_FILE.tmp" <<ENVEOF
IMAGE_TAG='$IMAGE_TAG'
ECR_REGISTRY='$ECR_REGISTRY'
POSTGRES_PASSWORD='$DB_PASSWORD'
DATABASE_URL='postgresql+psycopg://notes:$DB_PASSWORD_URLENC@db:5432/notes'
TUNNEL_TOKEN='$TUNNEL_TOKEN'
ENVEOF
chmod 600 "$ENV_FILE.tmp"
mv "$ENV_FILE.tmp" "$ENV_FILE"

compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

echo "==> Logging in to ECR"
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY"

echo "==> Pulling images"
compose pull

echo "==> Starting database and running migrations"
compose up -d --wait db
compose run --rm --no-deps backend alembic upgrade head

echo "==> Starting stack"
compose up -d --remove-orphans

echo "==> Waiting for backend health"
for _ in $(seq 1 30); do
  if curl -fsS --max-time 3 http://localhost:8000/health >/dev/null 2>&1; then
    echo "Backend healthy"
    healthy=1
    break
  fi
  sleep 2
done
if [[ -z "${healthy:-}" ]]; then
  echo "Backend did not become healthy within ~60s" >&2
  compose ps >&2 || true
  compose logs --tail 50 backend >&2 || true
  exit 1
fi

echo "==> Pruning old images"
docker image prune -af --filter "until=72h"

echo "Deployed $IMAGE_TAG"
