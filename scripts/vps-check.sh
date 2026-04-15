#!/bin/bash
# =============================================================================
# vps-check.sh — Dome Audit Environment Checker
#
# Verifica que el VPS está correctamente configurado para ejecutar vps-audit.sh
#
# Usage:
#   bash /opt/dome-audit/vps-check.sh
# =============================================================================

REPO_DIR="${REPO_DIR:-/opt/dome-audit/dome}"
REPO_URL="${REPO_URL:-https://github.com/maxprain12/dome.git}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS=0
FAIL=0

ok()   { echo -e "  ${GREEN}✓${NC} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}✗${NC} $1"; FAIL=$((FAIL + 1)); }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }
section() { echo -e "\n${YELLOW}── $1${NC}"; }

# ── Dependencies ──────────────────────────────────────────────────────────────
section "Dependencias"

command -v git      &>/dev/null && ok "git $(git --version | awk '{print $3}')"      || fail "git no instalado"
command -v node     &>/dev/null && ok "node $(node --version)"                         || fail "node no instalado"
command -v npm      &>/dev/null && ok "npm $(npm --version)"                           || fail "npm no instalado"
command -v gh       &>/dev/null && ok "gh $(gh --version | head -1 | awk '{print $3}')" || fail "gh CLI no instalado"
command -v opencode &>/dev/null && ok "opencode $(opencode --version 2>/dev/null || echo 'instalado')" || fail "opencode no instalado  →  npm install -g opencode-ai"

# ── GitHub auth ───────────────────────────────────────────────────────────────
section "GitHub auth"

if gh auth status &>/dev/null; then
  GH_USER=$(gh api user --jq '.login' 2>/dev/null)
  ok "gh autenticado como: ${GH_USER}"
else
  fail "gh no autenticado  →  export GH_TOKEN=ghp_xxx"
fi

if [ -n "$GH_TOKEN" ]; then
  ok "GH_TOKEN definido"
else
  warn "GH_TOKEN no está en el entorno actual (puede estar en ~/.bashrc)"
fi

# ── Repo ──────────────────────────────────────────────────────────────────────
section "Repositorio"

if [ -d "$REPO_DIR/.git" ]; then
  ok "Repo clonado en $REPO_DIR"
  CURRENT_BRANCH=$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)
  HEAD_SHA=$(git -C "$REPO_DIR" rev-parse --short HEAD)
  ok "Branch actual: ${CURRENT_BRANCH} @ ${HEAD_SHA}"

  # Check if main is up to date
  git -C "$REPO_DIR" fetch origin main --quiet 2>/dev/null
  LOCAL=$(git -C "$REPO_DIR" rev-parse HEAD)
  REMOTE=$(git -C "$REPO_DIR" rev-parse origin/main)
  if [ "$LOCAL" = "$REMOTE" ] || [ "$CURRENT_BRANCH" != "main" ]; then
    ok "Repo sincronizado con origin/main"
  else
    warn "Repo desactualizado — el cron hará git pull automáticamente"
  fi
else
  fail "Repo no clonado en $REPO_DIR  →  git clone $REPO_URL $REPO_DIR"
fi

# ── Script ────────────────────────────────────────────────────────────────────
section "Script de auditoría"

SCRIPT_PATH="/opt/dome-audit/vps-audit.sh"
if [ -f "$SCRIPT_PATH" ]; then
  ok "Script existe: $SCRIPT_PATH"
  if [ -x "$SCRIPT_PATH" ]; then
    ok "Script es ejecutable"
  else
    fail "Script no es ejecutable  →  chmod +x $SCRIPT_PATH"
  fi
else
  fail "Script no encontrado: $SCRIPT_PATH"
fi

# ── OpenCode config ───────────────────────────────────────────────────────────
section "OpenCode config"

OC_CONFIG="$HOME/.config/opencode/config.json"
if [ -f "$OC_CONFIG" ]; then
  ok "Config existe: $OC_CONFIG"
  if command -v python3 &>/dev/null; then
    MODEL=$(python3 -c "import json; d=json.load(open('$OC_CONFIG')); print(d.get('model','?'))" 2>/dev/null)
    BASE=$(python3 -c "import json; d=json.load(open('$OC_CONFIG')); print(d.get('baseURL','?'))" 2>/dev/null)
    ok "Modelo: ${MODEL}"
    ok "Base URL: ${BASE}"
  fi

  # Check API key is not the placeholder
  if grep -q "TU_MINIMAX_API_KEY" "$OC_CONFIG" 2>/dev/null; then
    fail "API key no configurada (sigue siendo el placeholder)"
  else
    ok "API key configurada"
  fi
else
  fail "Config no existe: $OC_CONFIG  →  ver docs/vps-audit-setup.md sección 3"
fi

# ── Crontab ───────────────────────────────────────────────────────────────────
section "Crontab"

CRON_JOBS=$(crontab -l 2>/dev/null | grep "vps-audit.sh" | grep -v "^#")

if [ -n "$CRON_JOBS" ]; then
  CRON_COUNT=$(echo "$CRON_JOBS" | wc -l | tr -d ' ')
  ok "${CRON_COUNT} job(s) configurados:"
  echo "$CRON_JOBS" | while IFS= read -r line; do
    # Parse cron expression to human-readable
    HOUR=$(echo "$line" | awk '{print $2}')
    DOW=$(echo "$line"  | awk '{print $5}')
    FOCUS=$(echo "$line" | grep -oE '\b(all|security|types|i18n|debt)\b' | head -1)

    if [ "$DOW" = "*" ]; then
      SCHEDULE="diario ${HOUR}:00"
    else
      DAYS=("" "lunes" "martes" "miércoles" "jueves" "viernes" "sábado" "domingo")
      SCHEDULE="${DAYS[$DOW]} ${HOUR}:00"
    fi
    echo -e "      ${GREEN}→${NC} ${FOCUS:-?}  (${SCHEDULE})"
  done
else
  fail "No hay jobs de vps-audit.sh en crontab  →  crontab -e"
  warn "Ejemplo:"
  echo "      0 3 * * * REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh security >> /var/log/dome-audit.log 2>&1"
fi

# ── Log file ──────────────────────────────────────────────────────────────────
section "Log"

LOG_FILE="/var/log/dome-audit.log"
if [ -f "$LOG_FILE" ]; then
  LOG_LINES=$(wc -l < "$LOG_FILE")
  ok "Log existe: $LOG_FILE (${LOG_LINES} líneas)"
  LAST_RUN=$(grep "Starting audit" "$LOG_FILE" 2>/dev/null | tail -1)
  if [ -n "$LAST_RUN" ]; then
    ok "Última ejecución: $(echo "$LAST_RUN" | grep -oP '\[\K[^\]]*')"
  else
    warn "Sin ejecuciones previas en el log"
  fi
else
  warn "Log no existe todavía (se crea en la primera ejecución)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "─────────────────────────────────────────"
if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}✓ Todo OK${NC} — ${PASS} checks pasados"
else
  echo -e "${RED}✗ ${FAIL} problema(s)${NC} — ${PASS} OK, ${FAIL} fallidos"
fi
echo "─────────────────────────────────────────"
