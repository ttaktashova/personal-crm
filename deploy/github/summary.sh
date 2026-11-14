#!/usr/bin/env bash
# Runs on the GitHub Actions runner at the end of Deploy prod, not on the server: writes which
# version was deployed to the run's summary (the run page on GitHub, under the steps).
#
# Environment: SHA, CHOSEN, BEFORE (from prod-version.sh), DEPLOY_OUTCOME and CLEANUP_OUTCOME
# (outcomes of those steps: success, failure, cancelled or skipped)

set -euo pipefail

commit_url="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/commit"

version_link() {
  if [[ "$1" == none ]]; then
    echo none
  else
    echo "[\`${1:0:7}\`]($commit_url/$1)"
  fi
}

case "$DEPLOY_OUTCOME" in
  success) result="deployed" ;;
  skipped) result="NOT DEPLOYED: a step before the deploy failed, prod was not changed" ;;
  *) result="DEPLOY FAILED: see the log of the step \"Deploy on the server\"" ;;
esac

case "$CLEANUP_OUTCOME" in
  success) cleanup="done, the newest 10 builds are kept" ;;
  skipped) cleanup="not run" ;;
  *) cleanup="FAILED: see the log of the step \"Delete old images from GHCR\"" ;;
esac

{
  echo "## Prod: $result"
  echo
  echo "| | |"
  echo "|---|---|"
  echo "| Version | $(version_link "$SHA") \`$SHA\` |"
  echo "| Chosen | $CHOSEN |"
  echo "| Before this run | $(version_link "${BEFORE:-none}") |"
  echo "| Old images in GHCR | $cleanup |"
  if [[ "$DEPLOY_OUTCOME" == success && "${BEFORE:-none}" != none && "$BEFORE" != "$SHA" ]]; then
    echo
    echo "Roll back: run Deploy prod with **rollback** ticked, prod gets $(version_link "$BEFORE") back."
  fi
} >>"$GITHUB_STEP_SUMMARY"
