#!/usr/bin/env bash
# Runs on the GitHub Actions runner, not on the server: lets `ssh server` and `scp ... server:`
# reach the deploy user on the server with the deploy key.
#
# Environment: DEPLOY_SSH_KEY (secret), DEPLOY_KNOWN_HOSTS, DEPLOY_HOST, DEPLOY_USER (variables)

set -euo pipefail

: "${DEPLOY_SSH_KEY:?the DEPLOY_SSH_KEY secret is not set}"
: "${DEPLOY_KNOWN_HOSTS:?the DEPLOY_KNOWN_HOSTS variable is not set}"
: "${DEPLOY_HOST:?the DEPLOY_HOST variable is not set}"
: "${DEPLOY_USER:?the DEPLOY_USER variable is not set}"

install -m 700 -d ~/.ssh
(umask 077 && printf '%s\n' "$DEPLOY_SSH_KEY" >~/.ssh/deploy_key)
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" >~/.ssh/known_hosts
cat >~/.ssh/config <<EOF
Host server
  HostName $DEPLOY_HOST
  User $DEPLOY_USER
  IdentityFile ~/.ssh/deploy_key
  IdentitiesOnly yes
  BatchMode yes
  StrictHostKeyChecking yes
EOF
