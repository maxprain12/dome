#!/usr/bin/env bash
# Configure gh + git for Jenkins when GITHUB_TOKEN is injected via withCredentials.
# gh reads GH_TOKEN automatically — no need for `gh auth login --with-token`.
set -euo pipefail

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "WARN: GITHUB_TOKEN not set — gh/git GitHub ops will fail"
  exit 0
fi

export GH_TOKEN="$GITHUB_TOKEN"

if gh auth status -h github.com >/dev/null 2>&1; then
  echo "OK: gh authenticated via GH_TOKEN"
else
  echo "ERROR: gh auth check failed — verify github-quality-loop credential (repo + issues scopes)"
  exit 1
fi

if [ "${JENKINS_GH_SETUP_GIT:-0}" = "1" ]; then
  gh auth setup-git
fi
