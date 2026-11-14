#!/usr/bin/env bash
# Runs on the GitHub Actions runner for Deploy prod, not on the server: records the prod deploy in
# the repository's deploy history (Deployments → prod) with the version that is really deployed.
# A job-level `environment: prod` would record the commit the workflow runs from instead (the
# newest commit of main), which is wrong for a rollback or an older version.
#
#   deployment.sh start <sha>            - creates the record, marks it in progress, writes id to $GITHUB_OUTPUT
#   deployment.sh finish <id> <outcome>  - outcome of the deploy step: success, failure, cancelled or skipped
#
# Needs GH_TOKEN with deployments: write, APP_URL.

set -euo pipefail

usage="usage: deployment.sh start <sha> | deployment.sh finish <id> <outcome>"
REPO="$GITHUB_REPOSITORY"
RUN_URL="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"

case "${1:-}" in
  start)
    sha="${2:?$usage}"
    # auto_merge: false - this very commit, without merging main into it;
    # required_contexts: [] - do not wait for checks on the commit, Deploy prod checked staging
    id="$(jq -n --arg ref "$sha" \
      '{ref: $ref, environment: "prod", production_environment: true, auto_merge: false, required_contexts: [], description: "Deploy prod"}' |
      gh api "repos/$REPO/deployments" --input - --jq .id)"
    gh api "repos/$REPO/deployments/$id/statuses" -f state=in_progress -f log_url="$RUN_URL" >/dev/null
    echo "id=$id" >>"$GITHUB_OUTPUT"
    ;;
  finish)
    id="${2:?$usage}"
    outcome="${3:?$usage}"
    : "${APP_URL:?APP_URL is not set}"
    state=failure
    if [[ "$outcome" == success ]]; then
      state=success
    fi
    gh api "repos/$REPO/deployments/$id/statuses" \
      -f state="$state" -f log_url="$RUN_URL" -f environment_url="$APP_URL" >/dev/null
    ;;
  *)
    echo "$usage" >&2
    exit 1
    ;;
esac
