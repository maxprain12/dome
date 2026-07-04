#!/usr/bin/env bash
# Exit 0 when no Sonar-fix-worthy changes under source trees; 1 otherwise.
# Ignores Jenkins bootstrap (.jenkins-node), tool downloads, loop artifacts.
set -euo pipefail

ROOT="${1:-.}"
cd "$ROOT"

PATHS=(app electron packages shared scripts docs)

if ! git diff --quiet -- "${PATHS[@]}"; then
  exit 1
fi

untracked="$(git ls-files --others --exclude-standard -- "${PATHS[@]}" || true)"
if [ -n "$untracked" ]; then
  exit 1
fi

exit 0
