#!/usr/bin/env bash
# Restores the database of one environment from a backup file. Only a person runs it, by hand,
# in a terminal on the server.
#
#   check the file -> show which file replaces which database and wait for "yes"
#   -> back up the current database (prod only) -> stop the app -> drop and recreate the database
#   -> load the backup -> apply migrations (staging only) -> start the same app container -> smoke /health
#
# The app version does not change: the stopped app container is started again as it was.
# Staging is recreated from a prod backup: after loading it gets the migrations of the version
# running on staging, which may be newer than the version the backup was taken with.
# Nothing is rolled back automatically. If a step after stopping the app fails, the app stays
# stopped and the error says how to bring the database back.
#
# Usage: restore.sh <prod|staging> <backup-file>

set -euo pipefail

ENVIRONMENT="${1:?usage: restore.sh <prod|staging> <backup-file>}"
BACKUP="${2:?usage: restore.sh <prod|staging> <backup-file>}"
FAIL_PREFIX="RESTORE FAILED ($ENVIRONMENT)"
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

[[ -f "$BACKUP" && -r "$BACKUP" ]] || fail "$BACKUP is not a readable file"
BACKUP="$(realpath "$BACKUP")"
[[ -t 0 ]] || fail "run it in a terminal on the server: it asks for a confirmation"
check_env_file
take_lock

# Keep the app version: compose works with the image of the existing app container
APP_IMAGE="$(app_container_image)"
[[ -n "$APP_IMAGE" ]] || fail "there is no $ENVIRONMENT app container, deploy the app first"
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

if [[ "$ENVIRONMENT" == prod ]]; then
  version_note="it stays the same"
else
  version_note="it stays the same, its migrations are applied after loading"
fi

cat <<EOF

The $ENVIRONMENT database will be DELETED and replaced with the backup.

  Backup file:  $BACKUP
                $(du -h "$BACKUP" | cut -f1), saved $(TZ=Europe/Moscow date -r "$BACKUP" '+%Y-%m-%d %H:%M') Moscow time
                app version when it was taken: $backup_version
  Database:     $db_name in compose project $ENVIRONMENT, $db_size now
  App version:  $app_version, $version_note

EOF
if [[ "$ENVIRONMENT" == prod && "$backup_version" != "$app_version" && "$backup_version" != unknown && "$backup_version" != none ]]; then
  cat <<EOF
WARNING: the backup was taken with app version $backup_version, and version $app_version is running now.
Their database structure may differ. If the app does not work after the restore, either
  roll the app back to the version of the backup:
    bash $DEPLOY_DIR/deploy.sh prod ${APP_IMAGE%:*}:$backup_version
  or bring the restored database up to the running version (applies its migrations):
    bash $DEPLOY_DIR/deploy.sh prod $APP_IMAGE

EOF
fi

read -r -p 'Type "yes" to replace the database: ' answer
if [[ "$answer" != yes ]]; then
  echo "Cancelled. Nothing was changed."
  exit 1
fi

# Prod keeps a copy of the database it replaces; staging is a copy of prod and has no backups
if [[ "$ENVIRONMENT" == prod ]]; then
  echo "==> Backing up the current database"
  backup_db before-restore "$app_version" || fail "could not back up the current database. Nothing was changed."
  copy_before="$BACKUP_FILE"
  how_to_bring_back="The database as it was before the restore is in $copy_before
To bring it back run: bash $DEPLOY_DIR/restore.sh prod $copy_before"
else
  how_to_bring_back="Run the restore again with a fresh prod backup."
fi

# From here on a failure leaves the app stopped: better than an app on a half-restored database
failed_after_stop() {
  fail "$1. The app is stopped. $how_to_bring_back"
}

echo "==> Stopping the app"
"${COMPOSE[@]}" stop app ||
  fail "could not stop the app. The database was not changed."

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

if [[ "$ENVIRONMENT" == staging ]]; then
  echo "==> Applying the migrations of version $app_version"
  "${COMPOSE[@]}" run --rm migrate </dev/null || failed_after_stop "could not apply the migrations"
fi

echo "==> Starting the app, version $app_version"
"${COMPOSE[@]}" start app || failed_after_stop "could not start the app"

echo "==> Smoke check $HEALTH_URL"
smoke_check || fail "the database is restored, but the app did not pass the smoke check. Nothing was rolled back.
$how_to_bring_back"

echo "RESTORE SUCCEEDED ($ENVIRONMENT): $db_name is restored from $BACKUP"
if [[ "$ENVIRONMENT" == prod ]]; then
  echo "The database as it was before the restore is in $copy_before"
fi
