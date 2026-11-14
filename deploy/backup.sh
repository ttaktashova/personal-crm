#!/usr/bin/env bash
# The daily backup of the prod database. Run on the server by the systemd timer
# personal-crm-backup.timer every day at 03:00 Moscow time; deploy.sh installs the timer.
# Its output goes to the server journal: journalctl -u personal-crm-backup
#
# The backup goes to /opt/personal-crm/backups as <Moscow time>_daily_<app version>.dump,
# the newest 7 daily backups are kept (see backup_db in lib.sh).
# If a deploy or restore of prod is running, waits for it to finish, up to 30 minutes.
#
# Usage: backup.sh   (also by hand: sudo systemctl start personal-crm-backup.service)

set -euo pipefail

ENVIRONMENT=prod
FAIL_PREFIX="BACKUP FAILED ($ENVIRONMENT)"
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

check_env_file
wait_for_lock 1800

# compose needs the app image even to reach the database: the image of the running app
APP_IMAGE="$(app_container_image)"
[[ -n "$APP_IMAGE" ]] || fail "there is no $ENVIRONMENT app container, deploy the app first"
export APP_IMAGE
version="$(image_version "$APP_IMAGE")"

echo "==> Backing up the $ENVIRONMENT database (app version $version)"
backup_db daily "$version" </dev/null || fail "the database backup was not saved"

echo "BACKUP SUCCEEDED ($ENVIRONMENT): $BACKUP_FILE"
