#!/usr/bin/env bash
# Bootstrap missing Jenkins agent tools (gh, xvfb) without manual image setup.
# Prefers apt when root/sudo is available; falls back to portable gh in workspace.
set -euo pipefail

ROOT="${1:-.}"
cd "$ROOT"

TOOLS_DIR="${ROOT}/.jenkins-tools"
BIN_DIR="${TOOLS_DIR}/bin"
ENV_FILE="${ROOT}/.jenkins-tools.env"

mkdir -p "$BIN_DIR"

write_env() {
  cat > "$ENV_FILE" <<EOF
export PATH="${BIN_DIR}:\${PATH}"
EOF
}

write_env

echo "=== Bootstrap agent tools ==="
echo "tools dir: ${BIN_DIR}"

run_apt() {
  if ! command -v apt-get >/dev/null 2>&1; then
    return 1
  fi
  local pkgs=( "$@" )
  if [ "$(id -u)" = "0" ]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq "${pkgs[@]}"
    return 0
  fi
  if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    export DEBIAN_FRONTEND=noninteractive
    sudo apt-get update -qq
    sudo apt-get install -y -qq "${pkgs[@]}"
    return 0
  fi
  return 1
}

# shellcheck source=/dev/null
set -a
# shellcheck disable=SC1091
source "$ENV_FILE"
set +a

need_apt=()
command -v gh >/dev/null 2>&1 || need_apt+=( gh )
command -v Xvfb >/dev/null 2>&1 || command -v xvfb-run >/dev/null 2>&1 || need_apt+=( xvfb )
command -v xdpyinfo >/dev/null 2>&1 || need_apt+=( x11-xserver-utils )

if [ "${#need_apt[@]}" -gt 0 ]; then
  echo "Trying apt-get for: ${need_apt[*]}"
  if run_apt "${need_apt[@]}"; then
    echo "OK: apt-get installed ${need_apt[*]}"
  else
    echo "apt-get skipped (no root/sudo or not Debian/Ubuntu)"
  fi
fi

install_gh_portable() {
  if command -v gh >/dev/null 2>&1; then
    return 0
  fi

  local arch raw_arch
  raw_arch="$(uname -m)"
  case "$raw_arch" in
    x86_64) arch=amd64 ;;
    aarch64|arm64) arch=arm64 ;;
    *)
      echo "ERROR: unsupported architecture for portable gh: $raw_arch"
      return 1
      ;;
  esac

  local version="${GH_VERSION:-2.65.0}"
  local name="gh_${version}_linux_${arch}"
  local url="https://github.com/cli/cli/releases/download/v${version}/${name}.tar.gz"
  local tmp="${TOOLS_DIR}/gh.tgz"

  echo "Installing portable gh v${version} (${arch})..."
  curl -fsSL "$url" -o "$tmp"
  tar -xzf "$tmp" -C "$TOOLS_DIR" "${name}/bin/gh"
  ln -sf "${TOOLS_DIR}/${name}/bin/gh" "${BIN_DIR}/gh"
  rm -f "$tmp"
  echo "OK: portable gh → ${BIN_DIR}/gh"
}

if ! command -v gh >/dev/null 2>&1; then
  install_gh_portable
fi

# shellcheck disable=SC1091
source "$ENV_FILE"

for tool in git curl gh; do
  if command -v "$tool" >/dev/null 2>&1; then
    echo "OK: $tool → $($tool --version 2>&1 | head -1)"
  else
    echo "ERROR: still missing: $tool"
    exit 1
  fi
done

if command -v Xvfb >/dev/null 2>&1 || command -v xvfb-run >/dev/null 2>&1; then
  echo "OK: Xvfb stack available"
else
  echo "WARN: Xvfb not available — Electron may still run with no-sandbox (or fail on this agent)"
fi

echo "=== Bootstrap complete ==="
