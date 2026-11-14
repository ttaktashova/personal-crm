#!/usr/bin/env bash
# Deploys one app image to one environment on the server: prod or staging. GitHub Actions copies
# deploy/ to the environment's folder and runs it: deploy-staging.yml after every merge to main,
# deploy-prod.yml when a person runs it. It can also be run by hand, e.g. to roll back.
#
#   install the daily backup timer (prod only) -> pull image -> back up the database (prod only)
#   -> migrations in a one-off container -> start the new app -> smoke /health
#   -> remove old app images (prod only)
#
# The backup goes to /opt/personal-crm/backups and is named after the app version that was running
# before this deploy (see backup_db in lib.sh).
# Any failed step stops the deploy. Nothing is rolled back automatically.
#
# Usage: deploy.sh <prod|staging> <image> [ghcr-user]
#   A GHCR token on stdin (one line) is used to pull the image; it is not stored on the server.

set -euo pipefail

ENVIRONMENT="${1:?usage: deploy.sh <prod|staging> <image> [ghcr-user]}"
IMAGE="${2:?usage: deploy.sh <prod|staging> <image> [ghcr-user]}"
GHCR_USER="${3:-}"
FAIL_PREFIX="DEPLOY FAILED ($ENVIRONMENT)"
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

BACKUP_UNIT=personal-crm-backup
SYSTEMD_DIR=/etc/systemd/system

# Installs or updates the systemd timer that runs backup.sh every day at 03:00 Moscow time.
# Adds only its own two files to /etc/systemd/system. Uses sudo without a password, as the deploy
# user has it; -n fails at once instead of waiting for a password.
install_backup_timer() {
  local units unit changed=false status=0
  units="$(mktemp -d)"
  cat >"$units/$BACKUP_UNIT.service" <<EOF
# Installed by $DEPLOY_DIR/deploy.sh on every prod deploy: edit it in the repository, not here
[Unit]
Description=Back up the personal-crm prod database
Wants=docker.service
After=docker.service

[Service]
Type=oneshot
User=$(id -un)
ExecStart=/usr/bin/bash $DEPLOY_DIR/backup.sh
EOF
  cat >"$units/$BACKUP_UNIT.timer" <<EOF
# Installed by $DEPLOY_DIR/deploy.sh on every prod deploy: edit it in the repository, not here
[Unit]
Description=Back up the personal-crm prod database every day at 03:00 Moscow time

[Timer]
# The time zone is part of the schedule: the server's own time zone does not matter
OnCalendar=*-*-* 03:00:00 Europe/Moscow
# If the server was off at 03:00, the backup runs right after it starts
Persistent=true

[Install]
WantedBy=timers.target
EOF
  for unit in "$BACKUP_UNIT.service" "$BACKUP_UNIT.timer"; do
    if ! cmp -s "$units/$unit" "$SYSTEMD_DIR/$unit"; then
      sudo -n install -m 644 "$units/$unit" "$SYSTEMD_DIR/$unit" || status=1
      changed=true
    fi
  done
  rm -rf "$units"
  ((status == 0)) || return 1

  if [[ "$changed" == true ]]; then
    echo "Backup timer files updated"
    sudo -n systemctl daemon-reload || return 1
    # A restarted timer picks up a changed schedule; it does not take a backup by itself
    sudo -n systemctl enable "$BACKUP_UNIT.timer" || return 1
    sudo -n systemctl restart "$BACKUP_UNIT.timer" || return 1
  else
    sudo -n systemctl enable --now "$BACKUP_UNIT.timer" || return 1
  fi
  systemctl list-timers --all --no-pager "$BACKUP_UNIT.timer" || true
}

check_env_file
take_lock

export APP_IMAGE="$IMAGE"

if [[ "$ENVIRONMENT" == prod ]]; then
  echo "==> Installing the daily backup timer"
  install_backup_timer || fail "could not install the daily backup timer. Nothing was changed, the running version stays"
fi

echo "==> Deploying $IMAGE to $ENVIRONMENT"
echo "==> Pulling $IMAGE"
if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  # E.g. a manual rollback to the previous image, or the image the other environment pulled
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

if [[ "$ENVIRONMENT" == prod ]]; then
  # The version of the app container as it is now, before the new image replaces it
  version_before="$(image_version "$(app_container_image)")"

  echo "==> Backing up the database (app version before this deploy: $version_before)"
  backup_db deploy "$version_before" || fail "database backup failed, migrations were not run, the new image was not started"
fi

echo "==> Applying migrations"
"${COMPOSE[@]}" run --rm migrate || fail "migrations failed, the new image was not started"

echo "==> Starting the new app"
"${COMPOSE[@]}" up -d --no-deps app

echo "==> Smoke check $HEALTH_URL"
smoke_check || fail "the new app did not pass the smoke check. Nothing was rolled back."

current="$(cat "$ENV_DIR/current-image" 2>/dev/null || true)"
if [[ -n "$current" && "$current" != "$IMAGE" ]]; then
  echo "$current" >"$ENV_DIR/previous-image"
fi
echo "$IMAGE" >"$ENV_DIR/current-image"

# Old images are removed after a prod deploy only: app images built more than 2 weeks ago. Always
# kept, whatever their age: the current and the previous prod images (the previous one is the
# rollback) and the current staging image.
if [[ "$ENVIRONMENT" == prod ]]; then
  previous="$(cat "$APP_DIR/previous-image" 2>/dev/null || true)"
  staging_current="$(cat "$APP_DIR/staging/current-image" 2>/dev/null || true)"
  cutoff="$(date -d '14 days ago' +%s)"

  echo "==> Removing app images older than 2 weeks, keeping current and previous prod and current staging"
  docker image ls "${IMAGE%:*}" --format '{{.Repository}}:{{.Tag}}' | while read -r old; do
    [[ "$old" == "$IMAGE" || "$old" == "$previous" || "$old" == "$staging_current" ]] && continue
    built="$(docker image inspect -f '{{.Created}}' "$old" 2>/dev/null)" || continue
    built_at="$(date -d "$built" +%s 2>/dev/null)" || continue
    ((built_at < cutoff)) || continue
    docker image rm "$old" >/dev/null && echo "Removed $old, built $(TZ=Europe/Moscow date -d "@$built_at" '+%Y-%m-%d')" || true
  done
  docker image prune -f >/dev/null
fi

echo "DEPLOY SUCCEEDED ($ENVIRONMENT): $IMAGE"
