# VPS Audit Setup — Dome

Configura un VPS para auditar el codebase de Dome periódicamente con OpenCode + MiniMax,
generando PRs automáticas con los findings.

---

## Arquitectura

```
VPS (cron 3am)
  └─► vps-audit.sh
        ├─ git pull origin main
        ├─ git checkout -b audit/focus-timestamp
        ├─ opencode run --non-interactive --input prompt.md
        ├─ npm run typecheck && lint && build  (validación)
        ├─ git push + gh pr create
        └─ gh pr merge --auto --squash
                │
                ▼
        Pipeline normal de Dome
        CI → AI Review → auto-merge → PostHog
```

---

## 1. Requisitos del VPS

- Ubuntu 22.04+ (o Debian 12+)
- RAM: mínimo 2GB (el `npm run build` de Vite necesita ~1.5GB)
- Disco: 5GB libres
- Node.js 20+ y git instalados

---

## 2. Instalación

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

# GitHub CLI
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list
sudo apt update && sudo apt install gh

# OpenCode
npm install -g opencode-ai
```

---

## 3. Configurar OpenCode con MiniMax

```bash
mkdir -p ~/.config/opencode
cat > ~/.config/opencode/config.json << 'EOF'
{
  "provider": "openai-compatible",
  "baseURL": "https://api.minimax.chat/v1",
  "apiKey": "TU_MINIMAX_API_KEY",
  "model": "MiniMax-Text-01",
  "temperature": 0.2,
  "maxTokens": 8000
}
EOF
```

Verifica que funciona:

```bash
# Debe responder "Hello!" en el terminal
opencode run --dangerously-skip-permissions "Say hello and nothing else"
```

---

## 4. Configurar GitHub CLI

```bash
# Opción A — GitHub token (recomendado para VPS)
export GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
gh auth status  # debe mostrar "Logged in"

# Hacer el token persistente
echo 'export GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx' >> ~/.bashrc
source ~/.bashrc

# Configurar git
git config --global user.email "audit-bot@tudominio.com"
git config --global user.name "Dome Audit Bot"
```

---

## 5. Clonar el repo

```bash
sudo mkdir -p /opt/dome-audit
sudo chown $USER:$USER /opt/dome-audit

# Clonar usando el token
git clone https://$GH_TOKEN@github.com/maxprain12/dome.git /opt/dome-audit/dome

# Copiar el script de auditoría
cp /opt/dome-audit/dome/scripts/vps-audit.sh /opt/dome-audit/
chmod +x /opt/dome-audit/vps-audit.sh
```

---

## 6. Configurar cron

```bash
crontab -e
```

Añadir las líneas:

```cron
# Dome codebase auditor
# Cada audit tarda ~1h (build incluido). Se escalonan para no solaparse.
#
# ── CRÍTICOS — cada 6h (4x/día) ──────────────────────────────────────────────
0  0  * * *  REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh security >> /var/log/dome-audit.log 2>&1
0  6  * * *  REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh security >> /var/log/dome-audit.log 2>&1
0 12  * * *  REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh security >> /var/log/dome-audit.log 2>&1
0 18  * * *  REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh security >> /var/log/dome-audit.log 2>&1

0  1  * * *  REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh errors >> /var/log/dome-audit.log 2>&1
0  7  * * *  REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh errors >> /var/log/dome-audit.log 2>&1
0 13  * * *  REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh errors >> /var/log/dome-audit.log 2>&1
0 19  * * *  REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh errors >> /var/log/dome-audit.log 2>&1

# ── ALTOS — cada 6h (4x/día) ─────────────────────────────────────────────────
0  2  * * *  REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh types >> /var/log/dome-audit.log 2>&1
0  8  * * *  REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh types >> /var/log/dome-audit.log 2>&1
0 14  * * *  REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh types >> /var/log/dome-audit.log 2>&1
0 20  * * *  REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh types >> /var/log/dome-audit.log 2>&1

0  3  * * *  REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh react >> /var/log/dome-audit.log 2>&1
0  9  * * *  REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh react >> /var/log/dome-audit.log 2>&1
0 15  * * *  REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh react >> /var/log/dome-audit.log 2>&1
0 21  * * *  REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh react >> /var/log/dome-audit.log 2>&1

# ── MEDIOS — cada 12h (2x/día) ───────────────────────────────────────────────
0  4  * * *  REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh debt >> /var/log/dome-audit.log 2>&1
0 16  * * *  REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh debt >> /var/log/dome-audit.log 2>&1

0  5  * * *  REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh i18n >> /var/log/dome-audit.log 2>&1
0 17  * * *  REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh i18n >> /var/log/dome-audit.log 2>&1

# ── BAJOS — 2x/semana ────────────────────────────────────────────────────────
0 10  * * 1,4  REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh vulns >> /var/log/dome-audit.log 2>&1

# ── PAQUETES — diaria 23:00 UTC (fuera de horas pico) ────────────────────────
0 23  * * *  REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh deps >> /var/log/dome-audit.log 2>&1

# ── RESUMEN — lunes completo ──────────────────────────────────────────────────
0 11  * * 1  REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh all >> /var/log/dome-audit.log 2>&1

# ── Findings lifecycle ───────────────────────────────────────────────────────
# Extractor (cada 30min, recoge .pending jobs dejados por vps-audit.sh)
*/30 * * * *  bash /opt/dome-audit/vps-audit-findings-cron.sh >> /var/log/dome-audit.log 2>&1
# Re-verificación contra main (cada hora, marca findings resueltos)
0    * * * *  REPO_DIR=/opt/dome-audit/dome bash /opt/dome-audit/vps-audit-resolve.sh >> /var/log/dome-audit.log 2>&1
# Dashboard (cada 15min)
*/15 * * * *  bash /opt/dome-audit/vps-audit-dashboard.sh >> /var/log/dome-audit.log 2>&1
```

Ver logs:

```bash
tail -f /var/log/dome-audit.log
```

---

## 7. Tipos de auditoría


| Comando    | Qué revisa                                       | Frecuencia          | Veces/día |
| ---------- | ------------------------------------------------ | ------------------- | --------- |
| `security` | IPC validation, SQL injection, path traversal    | Cada 6h (0,6,12,18) | 4x        |
| `errors`   | Error Boundaries (0), IPC try/catch              | Cada 6h (1,7,13,19) | 4x        |
| `types`    | any types, import type, null assertions          | Cada 6h (2,8,14,20) | 4x        |
| `react`    | useEffect cleanup, state mutations, missing deps | Cada 6h (3,9,15,21) | 4x        |
| `debt`     | Hardcoded colors (~~468), console.logs (~~233)   | Cada 12h (4,16)     | 2x        |
| `i18n`     | Traducciones faltantes en los 4 idiomas          | Cada 12h (5,17)     | 2x        |
| `vulns`    | npm audit: 1 critical + 22 high vulnerabilities  | Lunes y jueves 10h  | 2x/semana |
| `deps`     | Mantiene paquetes autorizados y al día (patch+minor), bloquea majors de paquetes congelados | Diaria 23h | 1x/día |
| `all`      | Todo lo anterior                                 | Lunes 11h           | 1x/semana |


Lanzar manualmente:

```bash
REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh security
```

---

## 8. Cómo funcionan las PRs generadas

Las PRs de auditoría siguen exactamente el mismo pipeline que las PRs manuales:

```
audit/security-20260414-0300
  └─► CI: TypeScript + Lint + Build + Architecture Guard
  └─► AI Review: 3 passes (arch, logic, style)
  └─► Auto-merge si todos los checks pasan
  └─► Post-merge: PostHog flag (none en auditorías)
```

**Si el CI falla**: el script aborta antes de crear la PR (valida localmente primero).
**Si el AI review sugiere cambios**: los cambios ya están en el código, el review es informativo.
**Si no hay issues**: el script no crea ninguna PR — solo loguea "codebase clean".

---

## 9. Seguridad del VPS

El bot solo necesita estos permisos en GitHub:

- `repo` (leer y escribir código, crear PRs)
- NO necesita `admin`, `delete_repo`, ni permisos de organización

Usar un **GitHub Fine-grained token** en lugar de un classic token:

```
GitHub → Settings → Developer settings → Fine-grained tokens → New token
Repository access: Solo el repo dome
Permissions:
  - Contents: Read and write
  - Pull requests: Read and write
  - Metadata: Read
```

---

## 10. Verificar que funciona

```bash
# Verificar que OpenCode funciona en el VPS
opencode run --dangerously-skip-permissions "Say hello and nothing else"

# Test manual con focus pequeño (i18n es el más rápido)
REPO_DIR=/opt/dome-audit/dome bash /opt/dome-audit/dome/scripts/vps-audit.sh i18n

# Ver si se creó una PR
gh pr list --repo maxprain12/dome --state open | grep audit

# Ver log de la última ejecución
tail -50 /var/log/dome-audit.log
```

---

## 11. Ciclo de vida de los findings

Los findings extraídos del AI review se almacenan en
`/var/log/dome-audit-findings/<focus>.findings.json` con un `id` estable
`<focus>:<file>:<line>:<sha1(pattern)>`. Cada finding pasa por estos estados:

1. **open** — detectado en el último review, aún presente en `main`.
2. **verifying** — no apareció en el último review (candidato a resolución).
3. **resolved** — `vps-audit-resolve.sh` confirmó que el `pattern` ya no existe
   en el archivo referenciado de `main` (o el archivo fue eliminado).

El dashboard sólo muestra findings en estado `open`. Las transiciones quedan
registradas en `/var/log/dome-audit-findings/resolutions.log`.

Ejecución manual:

```bash
# Re-verificar todos los findings contra main (marca resueltos)
REPO_DIR=/opt/dome-audit/dome bash /opt/dome-audit/vps-audit-resolve.sh

# Reporte rápido por terminal
bash /opt/dome-audit/vps-audit-findings.sh --report
```

Si quieres forzar una pasada de resolución tras desplegar estos scripts:

```bash
FORCE_RESOLVE=1 bash /opt/dome-audit/vps-audit-findings-cron.sh
```

---

## 12. Deploy de cambios en los scripts

Los scripts viven en el repo (`scripts/vps-audit*.sh`). Tras un `git pull` en el
VPS hay que copiarlos a `/opt/dome-audit/` porque cron los ejecuta desde ahí:

```bash
cd /opt/dome-audit/dome && git pull origin main
cp scripts/vps-audit.sh \
   scripts/vps-audit-findings.sh \
   scripts/vps-audit-findings-cron.sh \
   scripts/vps-audit-resolve.sh \
   scripts/vps-audit-dashboard.sh \
   scripts/vps-audit-chain.sh \
   /opt/dome-audit/
chmod +x /opt/dome-audit/vps-audit*.sh
```

El dashboard lee `audit-milestones.json` desde el clone en `/opt/dome-audit/dome/scripts/`,
así que un `git pull` en el clone basta para propagar cambios de milestones — no hay
que copiarlo a `/opt/dome-audit/`.

---

## 13. Prompts versionados (editar para ajustar a los agentes)

Los prompts que reciben los agentes viven en el repo bajo `prompts/`:

```
prompts/
├── shared/
│   └── project-context.md     # Contexto del proyecto (stack, CSS vars, i18n)
├── audits/
│   ├── _chain-header.md       # Inyectado en modo cadena (ver §14)
│   ├── security.md            # Un archivo por focus (con frontmatter YAML)
│   ├── errors.md
│   ├── types.md
│   ├── react.md
│   ├── debt.md
│   ├── i18n.md
│   ├── vulns.md
│   ├── deps.md
│   └── all.md
└── review/
    ├── architecture.md        # AI review pass 1
    ├── logic.md               # AI review pass 2
    └── style.md               # AI review pass 3
```

Cada archivo tiene frontmatter YAML con `version:` — incrementarlo cuando se
cambia el prompt. El PR generado incluye el `Prompt bundle` (por ejemplo,
`shared@1+security@2`) para poder correlacionar findings con la versión que los
produjo. El campo `first_seen_prompt_version` se persiste en cada finding.

Para ajustar un prompt basta con editar el `.md` correspondiente, subir un commit
a `main`, y hacer `git pull` en el VPS — el próximo run de cron lo usará.

---

## 14. Auditorías encadenadas (`vps-audit-chain.sh`)

Ejecuta varias focuses en orden, pasando los findings de los anteriores como
contexto a los siguientes:

```bash
# Manual
bash /opt/dome-audit/vps-audit-chain.sh security,errors,types

# Cron (diario 4am, tras el batch crítico)
0 4 * * *  /opt/dome-audit/vps-audit-chain.sh security,errors,types >> /var/log/dome-audit.log 2>&1
```

Cada focus recibe un `--chain-context` con los 10 top open findings por severidad
de los focuses previos. El agente decide si cruzar referencias, levantar TODOs
del focus anterior o dejar intacto.

Si algún paso falla el chain se detiene — los focuses anteriores ya habrán
creado su PR independientemente.

---

## 15. Milestones + trends en el dashboard

Config: `scripts/audit-milestones.json` (en el repo). Define:

- `per_focus[]` — objetivos por focus, con `metric: "open_findings"`, `target`,
  `deadline` (YYYY-MM-DD) y `label`.
- `global` — objetivo de health score, con `metric: "health_score"`, `target`,
  `deadline`.

El dashboard (`vps-audit-dashboard.sh`) lee esta config, calcula el estado de
cada milestone (`on-track` / `at-risk` / `overdue`) con base en el progreso y la
pendiente de los últimos 7+ snapshots, y renderiza una sección **Milestones**
antes del grid de foci.

History file: `/var/log/dome-audit-findings/history.jsonl` (append-only, una
línea por focus + una línea `__global__` cada vez que corre el dashboard — por
defecto cada 15 min). Se trunca automáticamente a `HISTORY_MAX_LINES` (default
5000, ~52 días con la cadencia de 15 min). Puedes ajustarlo:

```bash
HISTORY_MAX_LINES=10000 bash /opt/dome-audit/vps-audit-dashboard.sh
```

Las sparklines del dashboard (per-focus y global de health score) se dibujan
desde las últimas 30 entradas de este archivo.

