#!/usr/bin/env bash
# Restores the prod database from a backup file. Only a person runs it, by hand, in a terminal on the server.
#
#   check the file -> show which file replaces which database and wait for "yes"
#   -> back up the current database -> stop the app -> drop and recreate the database
#   -> load the backup -> start the same app container -> smoke /health
#
# The app version does not change: the stopped app container is started again as it was.
# Nothing is rolled back automatically. If a step after stopping the app fails, the app stays
# stopped and the error names the copy of the database taken before the restore.
#
# Usage: restore.sh <backup-file>

set -euo pipefail

BACKUP="${1:?usage: restore.sh <backup-file>}"
FAIL_PREFIX="RESTORE FAILED"
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

[[ -f "$BACKUP" && -r "$BACKUP" ]] || fail "$BACKUP is not a readable file"
BACKUP="$(realpath "$BACKUP")"
[[ -t 0 ]] || fail "run it in a terminal on the server: it asks for a confirmation"
check_env_file
take_lock

# Keep the app version: compose works with the image of the existing app container
APP_IMAGE="$(app_container_image)"
[[ -n "$APP_IMAGE" ]] || fail "there is no prod app container, deploy the app first"
export APP_IMAGE
app_version="$(image_version "$APP_IMAGE")"

echo "==> Starting the database"
"${COMPOSE[@]}" up -d --wait db

echo "==> Checking the backup file"
"${COMPOSE[@]}" exec -T db pg_restore --list <"$BACKUP" >/dev/null ||
  fail "$BACKUP is not a database backup made by these scripts. Nothing was changed."

# Commands that need no input get </dev/null, so they never eat what is typed in the terminal
db_name="$("${COMPOSE[@]}" exec -T db printenv POSTGRES_DB </dev/null)"
# shellcheck disable=SC2016 # the variables are expanded by the shell inside the container
db_size="$("${COMPOSE[@]}" exec -T db sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select pg_size_pretty(pg_database_size(current_database()))"' </dev/null ||
  echo unknown)"

# Backup names are <date>_<time>_<kind>_<app version>.dump
backup_name="$(basename "$BACKUP")"
backup_version=unknown
if [[ "$backup_name" =~ ^[0-9-]+_[0-9-]+_[a-z-]+_([0-9a-z]+)\.dump$ ]]; then
  backup_version="${BASH_REMATCH[1]}"
fi

cat <<EOF

The prod database will be DELETED and replaced with the backup.

  Backup file:  $BACKUP
                $(du -h "$BACKUP" | cut -f1), saved $(TZ=Europe/Moscow date -r "$BACKUP" '+%Y-%m-%d %H:%M') Moscow time
                app version when it was taken: $backup_version
  Database:     $db_name in compose project prod, $db_size now
  App version:  $app_version, it stays the same

EOF
if [[ "$backup_version" != "$app_version" && "$backup_version" != unknown && "$backup_version" != none ]]; then
  cat <<EOF
WARNING: the backup was taken with app version $backup_version, and version $app_version is running now.
Their database structure may differ. If the app does not work after the restore, either
  roll the app back to the version of the backup:
    bash $APP_DIR/deploy/deploy.sh ${APP_IMAGE%:*}:$backup_version
  or bring the restored database up to the running version (applies its migrations):
    bash $APP_DIR/deploy/deploy.sh $APP_IMAGE

EOF
fi

read -r -p 'Type "yes" to replace the database: ' answer
if [[ "$answer" != yes ]]; then
  echo "Cancelled. Nothing was changed."
  exit 1
fi

echo "==> Backing up the current database"
backup_db before-restore "$app_version" || fail "could not back up the current database. Nothing was changed."
copy_before="$BACKUP_FILE"

# From here on a failure leaves the app stopped: better than an app on a half-restored database
failed_after_stop() {
  fail "$1. The app is stopped. The database as it was before the restore is in $copy_before
To bring it back run: bash $APP_DIR/deploy/restore.sh $copy_before"
}

echo "==> Stopping the app"
"${COMPOSE[@]}" stop app ||
  fail "could not stop the app. The database was not changed. A copy of it is in $copy_before"

echo "==> Recreating the database $db_name"
# shellcheck disable=SC2016 # the variables are expanded by the shell inside the container
"${COMPOSE[@]}" exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\" WITH (FORCE)" \
  -c "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\""' </dev/null ||
  failed_after_stop "could not recreate the database"

echo "==> Loading the backup"
# One transaction: either the whole backup is loaded or the new database stays empty
# shellcheck disable=SC2016 # the variables are expanded by the shell inside the container
"${COMPOSE[@]}" exec -T db sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --single-transaction --exit-on-error --no-owner' <"$BACKUP" ||
  failed_after_stop "could not load the backup, the database is empty"

echo "==> Starting the app, version $app_version"
"${COMPOSE[@]}" start app || failed_after_stop "could not start the app"

echo "==> Smoke check $HEALTH_URL"
smoke_check || fail "the database is restored, but the app did not pass the smoke check. Nothing was rolled back.
The database as it was before the restore is in $copy_before"

echo "RESTORE SUCCEEDED: $db_name is restored from $BACKUP"
echo "The database as it was before the restore is in $copy_before"
