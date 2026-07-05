# Sonar quality loop — Jenkins + OpenCode

Automated correction loop: SonarQube → GitHub Issues → OpenCode CLI (MiniMax M3) → PR.

## Architecture

| Component | Role |
|-----------|------|
| Jenkins `dome-sonar` | Sonar analysis on push to `main` |
| Jenkins `dome-quality-loop` | Cron hourly: sync, pick batch, validate, mechanical fix (S7735 only), **OpenCode fixer**, fast gates, full verify, **OpenCode reviewer**, PR |
| OpenCode CLI | `sonar-fix` agent edits; `sonar-reviewer` read-only audit before PR |

## Jenkins setup

### Job `dome-quality-loop`

- Pipeline from SCM → **`Jenkinsfile.quality-loop`**
- Branch `*/main`
- Cron incluido en el pipeline (`H * * * *` — cada hora, minuto aleatorio)

### Credentials (Manage Jenkins → Credentials)

| ID Jenkins | Tipo | Uso |
|------------|------|-----|
| **SonarQube server `SonarQube`** | Plugin (Manage Jenkins → SonarQube) | Token para Web API (`SONAR_AUTH_TOKEN`) — **mismo que job `dome-sonar`** |
| **`github-quality-loop`** | GitHub PAT | `repo` + issues/PRs (`GITHUB_TOKEN`) |
| **`minimax-api-key`** | Secret text | API MiniMax (`MINIMAX_API_KEY`) → provider `minimax` en OpenCode |
| **`sonar-issue-admin`** *(opcional, local)* | User token Sonar (`squ_…`) exportado como `SONAR_ISSUE_ADMIN_TOKEN` | Solo stage *Close resolved* si el token del server no tiene **Administer Issues** |

Los stages Sonar usan `withSonarQubeEnv('SonarQube')`, no la credential suelta `sonar`.

**Stage *Close resolved*:** `POST /api/issues/do_transition` exige permiso **Administer Issues** en el proyecto. Un *Global Analysis Token* (`sqa_…`) devuelve `403 Insufficient privileges`. Opciones:

1. En SonarQube → proyecto → **Permissions** → conceder **Administer Issues** al usuario del token Jenkins.
2. Exportar `SONAR_ISSUE_ADMIN_TOKEN` con un **User Token** (`squ_…`) de un bot con ese permiso (p. ej. en el shell del stage Jenkins).
3. Omitir el stage: `SONAR_CLOSE_RESOLVED=0` (las issues se cierran solas en el próximo análisis `dome-sonar` tras merge).

**Local / fallback:** exporta `SONAR_TOKEN` (user token de SonarQube → My Account → Security). La Web API usa **Basic auth** (`token:` como login). Solo SonarQube ≥ 10.6 acepta `Bearer`; opcional `SONAR_AUTH_SCHEME=bearer`.

El pipeline mapea `minimax-api-key` → env `MINIMAX_API_KEY`.

### Modelo MiniMax (opcional)

Variables de entorno en el job (Environment / pipeline):

| Variable | Default |
|----------|---------|
| `SONAR_BATCH_SIZE` | `10` (issues por batch en pick-batch) |
| `SONAR_LOOP_MODEL` | `MiniMax-M3` (1M context) |
| `SONAR_LOOP_TIMEOUT_MS` | `3000000` (50 min fixer — único límite duro del agente; sin cap de steps en OpenCode) |
| `SONAR_REVIEW_TIMEOUT_MS` | `300000` (5 min reviewer) |
| `SONAR_LOOP_REVIEWER` | `1` — set `0` to skip LLM reviewer stage |
| `SONAR_LOOP_MAX_CHANGED_FILES` | `15` |
| `SONAR_LOOP_MAX_TOTAL_DIFF_LINES` | `800` |
| `OPENCODE_CONFIG` | `scripts/sonar/opencode.ci.json` |

### Agente Jenkins (Linux)

El pipeline ejecuta **`scripts/jenkins/bootstrap-agent-tools.sh`** + **`agent-preflight.sh`** al inicio, y **`bootstrap-opencode.sh`** en el stage Setup:

| Herramienta | Comportamiento |
|-------------|----------------|
| `git`, `curl` | deben existir en la imagen (Jenkins estándar) |
| **`gh`** | `apt-get` si hay root/sudo; si no, **descarga portable** a `.jenkins-tools/bin/` |
| **`opencode`** | `npm install -g opencode-ai` en `.jenkins-tools/npm-global` → symlink en `.jenkins-tools/bin/` |
| Node/pnpm | bootstrap en stage Setup |
| **better-sqlite3** | `npm rebuild better-sqlite3` en Install (solo para `test:coverage:electron`, no para el agente) |

No hace falta instalar `gh` u `opencode` a mano en el agente salvo que `apt` y la descarga fallen (sin red).

### Coolify / contenedor sin root

En Coolify (o cualquier agente Jenkins **sin** `sudo`/`apt`), OpenCode se instala portable vía npm en `.jenkins-tools/` (sin root). No se requiere Electron, `xvfb`, ni libs GTK/NSS del sistema para el stage *Agent fix*.

**Local:**

```bash
# Instalar OpenCode (una vez)
brew install opencode
# o: curl -fsSL https://opencode.ai/install | bash

export MINIMAX_API_KEY=sk-...
export OPENCODE_CONFIG="$PWD/scripts/sonar/opencode.ci.json"
export OPENCODE_DISABLE_AUTOUPDATE=1

pnpm run sonar:run-agent -- --dry-run
```

**Git commit:** el stage Verify & PR usa `stage-loop-changes.sh` — solo `app/`, `electron/`, `packages/`, `shared/`, `scripts/`, `docs/`. Nunca commitea `.jenkins-node/`, `.jenkins-tools/` ni artefactos del loop.

**Salvaguarda anti-truncado:** antes del commit, `verify-loop-diff.sh` bloquea diffs que borren >200 líneas en archivos guardados (p. ej. `globals.css`, `mcp-client.cjs`).

**Cuándo corre el agente fixer:** stage *Agent fix* solo si `source-tree-clean.sh` (sin diff en código fuente). Si el fix mecánico void falla fast gates, se **revierte** (`git checkout -- .`) y el fixer corre sobre el batch.

**Cuándo corre el fix mecánico void:** solo si el batch contiene regla **S7735** / `no-void` — **no** por la palabra `void` en el JSON.

## Flujo del pipeline (tiers)

1. Sync Sonar → GitHub issues (`pnpm run sonar:sync-github`) — cap 50 issues abiertas
2. Pick batch → `.quality-loop/batch.json`
3. **Validate batch** — `pnpm run sonar:validate-batch`
4. Fix mecánico void (**S7735 only**) → fast gates; revert si fallan
5. **Agent fix (OpenCode `sonar-fix`)** — si árbol limpio
6. **Fast gates (parallel)** — typecheck, lint, scope, diff safety → `.quality-loop/fast-gates.json`
7. **Full verify** — `verify-batch-pr.sh` (mirror GitHub CI)
8. **Agent review (OpenCode `sonar-reviewer`)** — read-only; `APPROVE` required (disable with `SONAR_LOOP_REVIEWER=0`)
9. Verify & PR — commit + push + PR (**auto-merge squash** cuando pase GitHub CI)
10. Close resolved en Sonar (fail-soft)

### Auto-merge de PRs

Tras `gh pr create`, el script `create-batch-pr.mjs` ejecuta `gh pr merge --auto --squash`. El merge ocurre cuando pasen los checks de GitHub Actions (igual que el flujo de [AGENTS.md](../../AGENTS.md)).

Requisitos en el repo **maxprain12/dome**:

- **Settings → General → Allow auto-merge** activado
- Branch protection en `main` con status checks requeridos (CI)

## Probar localmente

```bash
export MINIMAX_API_KEY=sk-...
export OPENCODE_CONFIG="$PWD/scripts/sonar/opencode.ci.json"
export OPENCODE_DISABLE_AUTOUPDATE=1

# Batch de prueba
pnpm run sonar:pick-batch -- --size=10 --out=.quality-loop/batch.json

# Dry run (sin API)
pnpm run sonar:run-agent -- --dry-run

# Run real
pnpm run sonar:run-agent -- --batch=.quality-loop/batch.json --model MiniMax-M3
```

Artefacto del run: `.quality-loop/agent-run.json`.

## Scripts

```bash
pnpm run sonar:fetch-issues
pnpm run sonar:sync-github
pnpm run sonar:pick-batch
pnpm run sonar:validate-batch
pnpm run sonar:fast-gates
pnpm run sonar:run-agent
pnpm run sonar:run-reviewer
pnpm run sonar:close-resolved
```

Config OpenCode CI: [`scripts/sonar/opencode.ci.json`](../../scripts/sonar/opencode.ci.json)  
Prompt del agente: [`.cursor/prompts/sonar-fix-batch-ci.md`](../.cursor/prompts/sonar-fix-batch-ci.md)

## Iteración manual (desarrollo)

Mismo prompt que usa el harness interactivo: [`.cursor/prompts/sonar-fix-batch.md`](../.cursor/prompts/sonar-fix-batch.md)

```
/loop 1d @.cursor/prompts/sonar-fix-batch.md
```

## Validación Jenkins

Tras merge a `main`:

1. Build manual de `dome-quality-loop` con batch reducido (`SONAR_BATCH_SIZE=3` en el job) para pruebas
2. Confirmar stage *Agent fix (OpenCode)* verde y `verify-loop-diff.sh` sin falsos positivos
3. PR auto-merge solo si CI pasa — **no confiar en auto-merge hasta 1 run verde**

## Quality Gate

Ver [sonar-quality-gate.md](./sonar-quality-gate.md).
