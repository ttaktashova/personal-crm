# Shared by deploy.sh and restore.sh: paths, the compose command and the steps both of them need.
# Sourced, not run. The calling script sets FAIL_PREFIX and exports APP_IMAGE before using COMPOSE.
# shellcheck shell=bash

APP_DIR=/opt/personal-crm
ENV_FILE="$APP_DIR/.env"
BACKUP_DIR="$APP_DIR/backups"
LOCK_FILE="$APP_DIR/.lock"
HEALTH_URL=http://127.0.0.1:3000/health
# Only the newest deploy backups are kept; copies taken before a restore are never removed automatically
KEEP_DEPLOY_BACKUPS=10
COMPOSE=(docker compose -p prod -f "$APP_DIR/deploy/compose.yaml" --env-file "$ENV_FILE")

fail() {
  echo "${FAIL_PREFIX:-FAILED}: $*" >&2
  exit 1
}

check_env_file() {
  [[ -f "$ENV_FILE" ]] || fail "$ENV_FILE not found"
  [[ "$(stat -c %a "$ENV_FILE")" == 600 ]] || fail "$ENV_FILE must have permissions 600"
}

# One deploy or restore at a time on the server; the lock is released when the script exits
take_lock() {
  exec 9>"$LOCK_FILE"
  flock -n 9 || fail "another deploy or restore is running on this server, try again when it finishes"
}

# The image of the prod app container, running or stopped; nothing if there is no such container
app_container_image() {
  local id
  id="$(docker ps -aq --filter label=com.docker.compose.project=prod --filter label=com.docker.compose.service=app | head -n 1)"
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
#   kind: "deploy" or "before-restore"; app version: the version running when the backup is taken.
# Returns non-zero if the backup was not saved; a half-written file never gets a .dump name.
backup_db() {
  local kind="$1" version="$2" file partial
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

  BACKUP_FILE="$file"
  echo "Backup saved: $file ($(du -h "$file" | cut -f1))"
  if [[ "$kind" == deploy ]]; then
    prune_deploy_backups || true
  fi
  return 0
}

# Keeps the newest $KEEP_DEPLOY_BACKUPS deploy backups. Names start with the time, so name order is time order.
prune_deploy_backups() {
  local old
  find "$BACKUP_DIR" -maxdepth 1 -type f -name '*_deploy_*.dump' -printf '%f\n' |
    sort | head -n "-$KEEP_DEPLOY_BACKUPS" | while read -r old; do
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
