#!/usr/bin/env bash
# Reject agent commits that truncate large files (file_write gone wrong).
set -euo pipefail

ROOT="${1:-.}"
MAX_FILE_DELETIONS="${SONAR_LOOP_MAX_FILE_DELETIONS:-200}"
MIN_MCP_CLIENT_LINES="${SONAR_LOOP_MIN_MCP_CLIENT_LINES:-400}"
MIN_GLOBALS_CSS_LINES="${SONAR_LOOP_MIN_GLOBALS_CSS_LINES:-5000}"

cd "$ROOT"

if ! git diff --cached --quiet; then
  DIFF_SCOPE='--cached'
elif ! git diff --quiet; then
  DIFF_SCOPE=''
else
  echo "verify-loop-diff: no staged or unstaged diff — OK"
  exit 0
fi

fail=0

while IFS=$'\t' read -r adds dels path; do
  dels="${dels:-0}"
  adds="${adds:-0}"
  case "$path" in
    app/globals.css)
      if [ "$dels" -gt "$MAX_FILE_DELETIONS" ]; then
        echo "ERROR: $path would delete $dels lines (cap $MAX_FILE_DELETIONS) — likely truncated by agent"
        fail=1
      fi
      ;;
    electron/mcp/mcp-client.cjs)
      if [ "$dels" -gt "$MAX_FILE_DELETIONS" ]; then
        echo "ERROR: $path would delete $dels lines (cap $MAX_FILE_DELETIONS) — likely truncated by agent"
        fail=1
      fi
      ;;
  esac
done < <(git diff $DIFF_SCOPE --numstat -- app/globals.css electron/mcp/mcp-client.cjs 2>/dev/null || true)

if [ -f electron/mcp/mcp-client.cjs ]; then
  lines=$(wc -l < electron/mcp/mcp-client.cjs | tr -d ' ')
  if [ "$lines" -lt "$MIN_MCP_CLIENT_LINES" ]; then
    echo "ERROR: electron/mcp/mcp-client.cjs has $lines lines (min $MIN_MCP_CLIENT_LINES)"
    fail=1
  fi
fi

if [ -f app/globals.css ]; then
  lines=$(wc -l < app/globals.css | tr -d ' ')
  if [ "$lines" -lt "$MIN_GLOBALS_CSS_LINES" ]; then
    echo "ERROR: app/globals.css has $lines lines (min $MIN_GLOBALS_CSS_LINES)"
    fail=1
  fi
fi

if [ "$fail" -ne 0 ]; then
  echo "verify-loop-diff: refusing destructive quality-loop diff"
  exit 1
fi

echo "verify-loop-diff: OK"
