#!/usr/bin/env bash
# Deploys one app image on the server. GitHub Actions copies deploy/ to the server and runs it;
# it can also be run by hand, e.g. to roll back to the previous image.
#
#   pull image -> back up the database -> migrations in a one-off container -> start the new app
#   -> smoke /health -> keep only the current and previous app images
#
# The backup goes to /opt/personal-crm/backups and is named after the app version that was running
# before this deploy (see backup_db in lib.sh).
# Any failed step stops the deploy. Nothing is rolled back automatically.
#
# Usage: deploy.sh <image> [ghcr-user]
#   A GHCR token on stdin (one line) is used to pull the image; it is not stored on the server.

set -euo pipefail

IMAGE="${1:?usage: deploy.sh <image> [ghcr-user]}"
GHCR_USER="${2:-}"
FAIL_PREFIX="DEPLOY FAILED"
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

check_env_file
take_lock

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

# The version of the app container as it is now, before the new image replaces it
version_before="$(image_version "$(app_container_image)")"

echo "==> Backing up the database (app version before this deploy: $version_before)"
backup_db deploy "$version_before" || fail "database backup failed, migrations were not run, the new image was not started"

echo "==> Applying migrations"
"${COMPOSE[@]}" run --rm migrate || fail "migrations failed, the new image was not started"

echo "==> Starting the new app"
"${COMPOSE[@]}" up -d --no-deps app

echo "==> Smoke check $HEALTH_URL"
smoke_check || fail "the new app did not pass the smoke check. Nothing was rolled back."

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
