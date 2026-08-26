#!/usr/bin/env bash
# Run SonarQube analysis via @sonar/scan (SonarScanner for NPM).
#
# Do NOT invoke a bare `sonar-scanner` binary: @sonar/scan v5 removed the
# `sonar` / `sonar-scanner` aliases. Spawning `sonar-scanner` looks on PATH and
# fails with ENOENT on agents that only have Node/pnpm (Jenkins build #280).
#
# Correct pnpm form (official docs):
#   pnpm --package=@sonar/scan dlx sonar-scanner-npm
#
# Usage (from repo root, inside withSonarQubeEnv):
#   bash scripts/jenkins/run-sonar-scanner.sh
#   bash scripts/jenkins/run-sonar-scanner.sh /path/to/checkout
set -euo pipefail

ROOT="${1:-.}"
cd "$ROOT"

if [ ! -s coverage/lcov.info ]; then
  echo "WARN: coverage/lcov.info missing or empty — running scanner without fresh coverage"
  mkdir -p coverage
  touch coverage/lcov.info
fi

# Explicit package + v5 bin name — never relies on a globally installed CLI.
exec pnpm --package=@sonar/scan dlx sonar-scanner-npm
