#!/usr/bin/env bash
# Deploys one app image on the server. GitHub Actions copies deploy/ to the server and runs it;
# it can also be run by hand, e.g. to roll back to the previous image.
#
#   pull image -> migrations in a one-off container -> start the new app -> smoke /health
#   -> keep only the current and previous app images
#
# Any failed step stops the deploy. Nothing is rolled back automatically.
#
# Usage: deploy.sh <image> [ghcr-user]
#   A GHCR token on stdin (one line) is used to pull the image; it is not stored on the server.

set -euo pipefail

IMAGE="${1:?usage: deploy.sh <image> [ghcr-user]}"
GHCR_USER="${2:-}"
APP_DIR=/opt/personal-crm
ENV_FILE="$APP_DIR/.env"
HEALTH_URL=http://127.0.0.1:3000/health
COMPOSE=(docker compose -p prod -f "$APP_DIR/deploy/compose.yaml" --env-file "$ENV_FILE")

fail() {
  echo "DEPLOY FAILED: $*" >&2
  exit 1
}

[[ -f "$ENV_FILE" ]] || fail "$ENV_FILE not found"
[[ "$(stat -c %a "$ENV_FILE")" == 600 ]] || fail "$ENV_FILE must have permissions 600"

export APP_IMAGE="$IMAGE"

echo "==> Pulling $IMAGE"
if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  # E.g. a manual rollback to the previous image: no download, no token needed
  echo "Image is already on the server"
else
  GHCR_TOKEN=""
  [[ -t 0 ]] || IFS= read -r -t 5 GHCR_TOKEN || true
  if [[ -n "$GHCR_TOKEN" ]]; then
    # Log in with a throwaway config dir so the token is never written to ~/.docker
    docker_config="$(mktemp -d)"
    trap 'rm -rf "$docker_config"' EXIT
    printf '%s' "$GHCR_TOKEN" |
      DOCKER_CONFIG="$docker_config" docker login ghcr.io -u "${GHCR_USER:-deploy}" --password-stdin >/dev/null
    DOCKER_CONFIG="$docker_config" docker pull "$IMAGE"
  else
    docker pull "$IMAGE"
  fi
fi

echo "==> Starting the database"
"${COMPOSE[@]}" up -d --wait db

echo "==> Applying migrations"
"${COMPOSE[@]}" run --rm migrate || fail "migrations failed, the new image was not started"

echo "==> Starting the new app"
"${COMPOSE[@]}" up -d --no-deps app

echo "==> Smoke check $HEALTH_URL"
status=""
for _ in $(seq 1 30); do
  status="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$HEALTH_URL" || true)"
  [[ "$status" == 200 ]] && break
  sleep 2
done
if [[ "$status" != 200 ]]; then
  "${COMPOSE[@]}" logs --tail 50 app >&2 || true
  fail "smoke check got HTTP ${status:-no answer} from $HEALTH_URL instead of 200. Nothing was rolled back."
fi
echo "Smoke check passed: HTTP 200"

current="$(cat "$APP_DIR/current-image" 2>/dev/null || true)"
if [[ -n "$current" && "$current" != "$IMAGE" ]]; then
  echo "$current" >"$APP_DIR/previous-image"
fi
echo "$IMAGE" >"$APP_DIR/current-image"
previous="$(cat "$APP_DIR/previous-image" 2>/dev/null || true)"

echo "==> Removing old app images, keeping current and previous"
docker image ls "${IMAGE%:*}" --format '{{.Repository}}:{{.Tag}}' | while read -r old; do
  [[ "$old" == "$IMAGE" || "$old" == "$previous" ]] && continue
  docker image rm "$old" >/dev/null && echo "Removed $old" || true
done
docker image prune -f >/dev/null

echo "DEPLOY SUCCEEDED: $IMAGE"
