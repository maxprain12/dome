#!/usr/bin/env bash
# Install OpenCode CLI portable into .jenkins-tools/bin (no root/apt).
set -euo pipefail

ROOT="${1:-.}"
cd "$ROOT"

TOOLS_DIR="${ROOT}/.jenkins-tools"
BIN_DIR="${TOOLS_DIR}/bin"
NPM_PREFIX="${TOOLS_DIR}/npm-global"
ENV_FILE="${ROOT}/.jenkins-tools.env"

mkdir -p "$BIN_DIR" "$NPM_PREFIX"

if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<EOF
export PATH="${BIN_DIR}:\${PATH}"
EOF
fi

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1091
  set -a
  source "$ENV_FILE"
  set +a
fi

if command -v opencode >/dev/null 2>&1; then
  echo "OK: opencode → $(opencode --version 2>&1 | head -1)"
  exit 0
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm required to install opencode (run Setup stage first)"
  exit 1
fi

OPENCODE_VERSION="${OPENCODE_VERSION:-latest}"
echo "Installing opencode-ai@${OPENCODE_VERSION} → ${NPM_PREFIX}..."
npm install -g "opencode-ai@${OPENCODE_VERSION}" --prefix "$NPM_PREFIX"

if [ -x "${NPM_PREFIX}/bin/opencode" ]; then
  ln -sf "${NPM_PREFIX}/bin/opencode" "${BIN_DIR}/opencode"
elif [ -f "${NPM_PREFIX}/bin/opencode" ]; then
  ln -sf "${NPM_PREFIX}/bin/opencode" "${BIN_DIR}/opencode"
else
  echo "ERROR: opencode binary not found under ${NPM_PREFIX}/bin"
  exit 1
fi

# shellcheck disable=SC1091
set -a
source "$ENV_FILE"
set +a

if ! command -v opencode >/dev/null 2>&1; then
  echo "ERROR: opencode not on PATH after install"
  exit 1
fi

echo "OK: opencode → $(opencode --version 2>&1 | head -1)"
