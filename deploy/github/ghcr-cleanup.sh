#!/usr/bin/env bash
# Runs on the GitHub Actions runner after a successful prod deploy, not on the server: keeps the
# newest $KEEP builds of the app image in GHCR and deletes the older ones. The server keeps its own
# copies of the images it needs (deploy.sh), so a prod rollback does not depend on GHCR.
#
# One build is one tagged version: deploy-staging.yml builds without a provenance attestation.
# Builds made before that also left untagged parts. An untagged version is deleted only when it is
# more than an hour older than the oldest kept build, so the parts of a kept build are never touched.
#
# Usage: ghcr-cleanup.sh [sha]
#   The image with this tag (the one just deployed to prod) is never deleted.
# Needs GH_TOKEN with packages: write; the repository needs the Admin role in the package settings
# (GitHub gives it to the repository whose workflow published the package first).

set -euo pipefail

KEEP=10
MARGIN_SECONDS=3600
PROTECTED_TAG="${1:-}"
OWNER="${GITHUB_REPOSITORY_OWNER,,}"
PACKAGE="${GITHUB_REPOSITORY#*/}"
PACKAGE="${PACKAGE,,}"
VERSIONS_URL="users/$OWNER/packages/container/$PACKAGE/versions"

# One line per version, newest first: id, creation time in seconds, tags separated by commas
# (empty for an untagged part; the last field, so an empty value does not shift the others)
versions="$(gh api --paginate "$VERSIONS_URL?per_page=100" \
  --jq '.[] | [.id, (.created_at | fromdateiso8601), (.metadata.container.tags | join(","))] | @tsv' |
  sort -t $'\t' -k2,2nr)"

kept=0
oldest_kept=""
delete_ids=()
delete_names=()
while IFS=$'\t' read -r id created tags; do
  [[ -n "$id" && -n "$tags" ]] || continue
  if ((kept < KEEP)) || [[ -n "$PROTECTED_TAG" && ",$tags," == *",$PROTECTED_TAG,"* ]]; then
    kept=$((kept + 1))
    oldest_kept="$created"
    continue
  fi
  delete_ids+=("$id")
  delete_names+=("$tags")
done <<<"$versions"

if [[ -z "$oldest_kept" ]]; then
  echo "No tagged images in GHCR, nothing to delete"
  exit 0
fi

while IFS=$'\t' read -r id created tags; do
  [[ -n "$id" && -z "$tags" ]] || continue
  if ((created < oldest_kept - MARGIN_SECONDS)); then
    delete_ids+=("$id")
    delete_names+=("untagged part of an old build, $(date -u -d "@$created" '+%Y-%m-%d %H:%M UTC')")
  fi
done <<<"$versions"

echo "GHCR: keeping the newest $kept builds, deleting ${#delete_ids[@]} versions"
for i in "${!delete_ids[@]}"; do
  gh api -X DELETE "$VERSIONS_URL/${delete_ids[$i]}" >/dev/null
  echo "Deleted ${delete_names[$i]}"
done
