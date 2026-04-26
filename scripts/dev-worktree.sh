#!/usr/bin/env bash
# Dev: perfil aislado + puerto Vite (worktrees en paralelo).
# Uso: ./scripts/dev-worktree.sh <slug-perfil> [puerto]
# Ejemplo: ./scripts/dev-worktree.sh feat-bugfix-1 5174
set -euo pipefail
PROFILE="${1:-local}"
PORT="${2:-}"
export DOME_PROFILE="$PROFILE"
if [[ -n "$PORT" ]]; then
  export DOME_VITE_PORT="$PORT"
  export VITE_DEV_PORT="$PORT"
else
  # Puerto libre en rango 51000-51999 si no se pasa
  export DOME_VITE_PORT="${DOME_VITE_PORT:-$((51000 + RANDOM % 1000))}"
  export VITE_DEV_PORT="$DOME_VITE_PORT"
fi
echo "DOME_PROFILE=$DOME_PROFILE  DOME_VITE_PORT=$DOME_VITE_PORT"
echo "Luego: npm run dev  (Vite) y en otra terminal con la misma env: npm run electron"
echo "O: npx concurrently \"npm run dev\" \"wait-on http://127.0.0.1:${DOME_VITE_PORT} && cross-env DOME_VITE_PORT=${DOME_VITE_PORT} DOME_PROFILE=${DOME_PROFILE} electron .\""
