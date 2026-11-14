#!/usr/bin/env bash
# Runs on the GitHub Actions runner for Deploy prod, not on the server: chooses the version to
# deploy and writes sha, image, chosen and before (the version prod runs now) to $GITHUB_OUTPUT.
#
#   ROLLBACK=true    - the prod version before the current one, remembered by the server
#                      (previous-image); staging is not checked, INPUT_SHA is ignored
#   INPUT_SHA empty  - the version of the newest successful staging deploy
#   INPUT_SHA=<sha>  - that commit (full SHA or its first 7+ characters), only if it has
#                      deployed to staging successfully at least once
#
# Changes nothing: a version that may not go to prod stops the run here.
# Needs `ssh server` (setup-ssh.sh), GH_TOKEN with deployments: read, PROD_DIR.

set -euo pipefail

fail() {
  echo "::error::$*" >&2
  exit 1
}

: "${PROD_DIR:?PROD_DIR is not set}"
REPO="$GITHUB_REPOSITORY"
IMAGE_REPO="ghcr.io/${GITHUB_REPOSITORY,,}"
# How many recent staging deploys are looked through
STAGING_DEPLOYS=50

# Prints the SHA of the newest staging deploy that succeeded; with a SHA argument, looks only at
# deploys of that commit. Returns non-zero if there is none.
# A successful deploy becomes "inactive" when a newer one succeeds, so all statuses of a deploy are
# checked, not only the last one.
staging_success_sha() {
  local filter="" deploys id sha successes
  if [[ -n "${1:-}" ]]; then
    filter="&sha=$1"
  fi
  deploys="$(gh api "repos/$REPO/deployments?environment=staging&per_page=$STAGING_DEPLOYS$filter" \
    --jq 'sort_by(.created_at) | reverse | .[] | "\(.id) \(.sha)"')"
  while read -r id sha; do
    [[ -n "$id" ]] || continue
    successes="$(gh api "repos/$REPO/deployments/$id/statuses?per_page=100" --jq '[.[] | select(.state == "success")] | length')"
    if [[ "$successes" != 0 ]]; then
      echo "$sha"
      return 0
    fi
  done <<<"$deploys"
  return 1
}

# What the server remembers: current-image or previous-image; empty if there is no such file
server_image() {
  # shellcheck disable=SC2029 # PROD_DIR is meant to be expanded here, on the runner
  ssh server "cat '$PROD_DIR/$1' 2>/dev/null || true"
}

current="$(server_image current-image)"
before="${current##*:}"
before="${before:-none}"

if [[ "${ROLLBACK:-false}" == true ]]; then
  image="$(server_image previous-image)"
  [[ -n "$image" ]] || fail "the server does not remember a prod version before the current one ($PROD_DIR/previous-image), there is nothing to roll back to"
  sha="${image##*:}"
  chosen="rollback to the prod version before the current one"
elif [[ -z "${INPUT_SHA//[[:space:]]/}" ]]; then
  sha="$(staging_success_sha)" ||
    fail "none of the last $STAGING_DEPLOYS staging deploys succeeded: deploy to staging first"
  image="$IMAGE_REPO:$sha"
  chosen="the last successful staging deploy"
else
  input="${INPUT_SHA//[[:space:]]/}"
  [[ "$input" =~ ^[0-9a-fA-F]{7,40}$ ]] ||
    fail "the sha field takes a commit SHA: 7 to 40 characters 0-9 and a-f. Leave it empty to deploy the last successful staging version"
  sha="$(gh api "repos/$REPO/commits/${input,,}" --jq .sha 2>/dev/null)" ||
    fail "there is no commit ${input,,} in $REPO"
  staging_success_sha "$sha" >/dev/null ||
    fail "version $sha has never deployed to staging successfully. Prod gets only versions that passed staging"
  image="$IMAGE_REPO:$sha"
  chosen="given by hand, passed staging"
fi

{
  echo "sha=$sha"
  echo "image=$image"
  echo "chosen=$chosen"
  echo "before=$before"
} >>"$GITHUB_OUTPUT"
echo "Prod runs $before now. Deploying $image: $chosen"
