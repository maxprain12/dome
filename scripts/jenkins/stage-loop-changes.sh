#!/usr/bin/env bash
# Stage only quality-loop source changes — never Jenkins bootstrap dirs.
set -euo pipefail

ROOT="${1:-.}"
cd "$ROOT"

PATHS=(app electron packages shared scripts docs)

git add -u -- "${PATHS[@]}"

for path in "${PATHS[@]}"; do
  if [ -d "$path" ]; then
    git add -- "$path"
  fi
done

for junk in \
  .jenkins-node \
  .jenkins-tools \
  .jenkins-tools.env \
  .quality-loop \
  coverage \
  .jenkins-display.env; do
  git reset HEAD -- "$junk" 2>/dev/null || true
done

if git diff --cached --quiet; then
  echo "ERROR: nothing staged for quality-loop commit (check agent produced file changes)"
  exit 1
fi

echo "Staged $(git diff --cached --name-only | wc -l | tr -d ' ') file(s):"
git diff --cached --name-only
