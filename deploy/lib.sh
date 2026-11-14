# Shared by deploy.sh, backup.sh and restore.sh: paths, the compose command and the steps they need.
# Sourced, not run. The calling script sets ENVIRONMENT (prod or staging) and FAIL_PREFIX before
# sourcing it, and exports APP_IMAGE before using COMPOSE.
# shellcheck shell=bash

fail() {
  echo "${FAIL_PREFIX:-FAILED}: $*" >&2
  exit 1
}

APP_DIR=/opt/personal-crm
# Backups are taken on prod only; restore.sh reads them for both environments
BACKUP_DIR="$APP_DIR/backups"
# The newest 7 backups of each kind are kept: taken by a deploy and daily ones. Copies taken before
# a restore are never removed automatically.
KEEP_BACKUPS=7
# The compose.yaml next to this file: every environment has its own copy of deploy/
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Each environment has its own folder with .env, lock and image files, its own compose project
# (own database volume), its own loopback port for nginx and, on staging, memory limits.
# A memory limit of 0 means no limit.
case "${ENVIRONMENT:-}" in
  prod)
    ENV_DIR="$APP_DIR"
    export APP_PORT=3000 APP_MEMORY_LIMIT=0 DB_MEMORY_LIMIT=0
    ;;
  staging)
    ENV_DIR="$APP_DIR/staging"
    export APP_PORT=3001 APP_MEMORY_LIMIT=512m DB_MEMORY_LIMIT=256m
    ;;
  *)
    fail "unknown environment \"${ENVIRONMENT:-}\", use prod or staging"
    ;;
esac

ENV_FILE="$ENV_DIR/.env"
LOCK_FILE="$ENV_DIR/.lock"
HEALTH_URL="http://127.0.0.1:$APP_PORT/health"
COMPOSE=(docker compose -p "$ENVIRONMENT" -f "$DEPLOY_DIR/compose.yaml" --env-file "$ENV_FILE")

check_env_file() {
  [[ -f "$ENV_FILE" ]] || fail "$ENV_FILE not found"
  [[ "$(stat -c %a "$ENV_FILE")" == 600 ]] || fail "$ENV_FILE must have permissions 600"
}

# One deploy, restore or backup at a time per environment; the lock is released when the script exits.
# Prod and staging have separate locks, so they do not wait for each other.
take_lock() {
  exec 9>"$LOCK_FILE"
  flock -n 9 || fail "another deploy, restore or backup of $ENVIRONMENT is running on this server, try again when it finishes"
}

# Like take_lock, but if the lock is taken, first waits up to <seconds> for it (the daily backup
# waits for a running deploy or restore instead of skipping the day)
wait_for_lock() {
  exec 9>"$LOCK_FILE"
  flock -n 9 && return 0
  echo "A deploy or restore of $ENVIRONMENT is running, waiting up to $1 seconds for it to finish"
  flock -w "$1" 9 || fail "a deploy or restore of $ENVIRONMENT was still running after $1 seconds"
}

# The image of this environment's app container, running or stopped; nothing if there is no such container
app_container_image() {
  local id
  id="$(docker ps -aq --filter "label=com.docker.compose.project=$ENVIRONMENT" --filter label=com.docker.compose.service=app | head -n 1)"
  if [[ -n "$id" ]]; then
    docker inspect -f '{{.Config.Image}}' "$id"
  fi
}

# The app version is the image tag, i.e. the commit SHA; "none" when there is no image
image_version() {
  if [[ -n "$1" ]]; then
    echo "${1##*:}"
  else
    echo none
  fi
}

# Dumps the prod database to $BACKUP_DIR/<Moscow time>_<kind>_<app version>.dump and sets BACKUP_FILE.
#   kind: "deploy", "daily" or "before-restore"; app version: the version running when the backup is taken.
# Returns non-zero if the backup was not saved; a half-written file never gets a .dump name.
backup_db() {
  local kind="$1" version="$2" file partial
  [[ "$ENVIRONMENT" == prod ]] || {
    echo "backups are taken on prod only" >&2
    return 1
  }
  file="$BACKUP_DIR/$(TZ=Europe/Moscow date +%Y-%m-%d_%H-%M-%S)_${kind}_${version}.dump"
  partial="$file.partial"

  # Backups hold personal data: only the owner can read them
  mkdir -p "$BACKUP_DIR" || return 1
  chmod 700 "$BACKUP_DIR" || return 1
  # Inside its own container Postgres lets its user in without a password, so .env is not read here
  # shellcheck disable=SC2016 # the variables are expanded by the shell inside the container
  if ! (umask 077 && "${COMPOSE[@]}" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' </dev/null >"$partial"); then
    rm -f "$partial"
    return 1
  fi
  if [[ ! -s "$partial" ]]; then
    echo "pg_dump wrote an empty file" >&2
    rm -f "$partial"
    return 1
  fi
  mv "$partial" "$file" || return 1

  # shellcheck disable=SC2034 # read by the scripts that source this file
  BACKUP_FILE="$file"
  echo "Backup saved: $file ($(du -h "$file" | cut -f1))"
  if [[ "$kind" == deploy || "$kind" == daily ]]; then
    prune_backups "$kind" || true
  fi
  return 0
}

# Keeps the newest $KEEP_BACKUPS backups of one kind. Names start with the time, so name order is time order.
prune_backups() {
  local kind="$1" old
  find "$BACKUP_DIR" -maxdepth 1 -type f -name "*_${kind}_*.dump" -printf '%f\n' |
    sort | head -n "-$KEEP_BACKUPS" | while read -r old; do
    rm -f "$BACKUP_DIR/$old" && echo "Removed old backup $old"
  done
}

# Waits up to a minute for /health to answer 200; on failure prints the app log and returns non-zero
smoke_check() {
  local status="" _
  for _ in $(seq 1 30); do
    status="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$HEALTH_URL" || true)"
    if [[ "$status" == 200 ]]; then
      echo "Smoke check passed: HTTP 200"
      return 0
    fi
    sleep 2
  done
  "${COMPOSE[@]}" logs --tail 50 app >&2 || true
  echo "Smoke check got HTTP ${status:-no answer} from $HEALTH_URL instead of 200" >&2
  return 1
}
