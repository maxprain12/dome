# Sonar quality loop — Jenkins + OpenCode

Automated correction loop: SonarQube → GitHub Issues → OpenCode CLI (MiniMax M3) → PR.

## Architecture

| Component | Role |
|-----------|------|
| Jenkins `dome-sonar` | Sonar analysis on push to `main` (`test:coverage` → lcov + pattern guards + scanner) |
| Jenkins `dome-quality-loop` | Cron hourly with **modes** (`issues` / `coverage` / `hotspots`): OpenCode fixer or coverage tests → PR; post always reviews hotspots + closes resolved |
| OpenCode CLI | `sonar-fix` (issues), `sonar-coverage` (tests), `sonar-reviewer` (read-only) |

## Jenkins setup

### Job `dome-quality-loop`

- Pipeline from SCM → **`Jenkinsfile.quality-loop`**
- Branch `*/main` (merge this branch first so Jenkins picks up the new modes)
- Cron incluido en el pipeline (`H * * * *` — cada hora, minuto aleatorio)
- Parameter **`SONAR_LOOP_MODE`**: `auto` \| `issues` \| `coverage` \| `hotspots`

### Loop modes

| Mode | When (`auto`) | What it does |
|------|----------------|--------------|
| **issues** | UTC hour `% 3` ∈ {0, 2} | Sync GitHub issues → pick Sonar batch → triage → fix → PR |
| **coverage** | UTC hour `% 3` == 1 | Pick files with most `uncovered_lines` → OpenCode writes tests → PR (`test/sonar-coverage-*`) |
| **hotspots** | Manual param only | Skip fixer; post still reviews hotspots |

`auto` ≈ **2/3 issues, 1/3 coverage** so coverage climbs over days without starving bug fixes.

Every run (even if Fast gates fail) **post always**:
1. `sonar:review-hotspots --apply` (SAFE / ACKNOWLEDGED classifier)
2. `sonar:close-resolved`

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
| `SONAR_BATCH_SIZE` | `3` (issues por batch en pick-batch) |
| `SONAR_COVERAGE_BATCH_SIZE` | `2` (files per coverage PR) |
| `SONAR_LOOP_MODE` | job param / `auto` (see modes above) |
| `SONAR_LOOP_MODEL` | `MiniMax-M3` (1M context) |
| `SONAR_LOOP_TIMEOUT_MS` | `3000000` (50 min fixer — único límite duro del agente; sin cap de steps en OpenCode) |
| `SONAR_REVIEW_TIMEOUT_MS` | `300000` (5 min reviewer) |
| `SONAR_LOOP_REVIEWER` | `1` — set `0` to skip LLM reviewer stage |
| `SONAR_TRIAGE_MODEL` | `MiniMax-M2.7-highspeed` (fast triage before fixer) |
| `SONAR_TRIAGE_TIMEOUT_MS` | `180000` (3 min triage agent) |
| `SONAR_LOOP_MAX_CHANGED_FILES` | `15` |
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

**Salvaguarda anti-truncado:** antes del commit, `verify-loop-diff.sh` bloquea diffs que borren >200 líneas en archivos guardados (p. ej. `globals.css`, `mcp-client.cjs`). Floor de líneas: `globals.css` ≥ 1500, `mcp-client.cjs` ≥ 400 (ajustable con env).

**Cuándo corre el agente fixer:** stage *Agent fix* solo si `source-tree-clean.sh` (sin diff en código fuente). Si el fix mecánico void falla fast gates, se **revierte** (`git checkout -- .`) y el fixer corre sobre el batch.

**Cuándo corre el fix mecánico void:** solo si el batch contiene regla **S7735** / `no-void` — **no** por la palabra `void` en el JSON.

## Flujo del pipeline (tiers)

0. **Resolve mode** (`auto` / `issues` / `coverage` / `hotspots`)
1. *(issues)* Sync Sonar → GitHub issues — cap 50
2. Pick batch — issues (`sonar:pick-batch`) **or** coverage (`sonar:pick-coverage` via Sonar `uncovered_lines`)
3. **Validate batch**
4. *(issues)* **Batch triage** → filter fix vs defer
5. *(issues)* Fix mecánico void (**S7735 only**); revert si fallan fast gates
6. **Agent** — `sonar-fix` or `sonar-coverage` (OpenCode)
7. **Fast gates** — typecheck, lint, scope, diff safety; on failure **revert tree** (no PR)
8. **Full verify** — `verify-batch-pr.sh`
9. **Agent review** — `APPROVE` required (`SONAR_LOOP_REVIEWER=0` to skip)
10. Verify & PR — auto-merge squash
11. **post always** — hotspots review + close resolved (fail-soft)

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
pnpm run sonar:pick-batch -- --size=3 --out=.quality-loop/batch.json

# Dry run (sin API)
pnpm run sonar:run-agent -- --dry-run

# Run real
pnpm run sonar:run-agent -- --batch=.quality-loop/batch.json --model MiniMax-M3
```

Artefacto del run: `.quality-loop/agent-run.json`.

## Scripts

```bash
pnpm run sonar:resolve-mode
pnpm run sonar:fetch-issues
pnpm run sonar:sync-github
pnpm run sonar:pick-batch
pnpm run sonar:pick-coverage
pnpm run sonar:validate-batch
pnpm run sonar:run-triage
pnpm run sonar:apply-triage
pnpm run sonar:fast-gates
pnpm run sonar:run-agent          # picks sonar-fix vs sonar-coverage from batch.kind
pnpm run sonar:run-reviewer
pnpm run sonar:review-hotspots -- --apply=true
pnpm run sonar:close-resolved
```

Coverage + hotspots background: [sonar-hotspots-and-coverage.md](./sonar-hotspots-and-coverage.md)

Config OpenCode CI: [`scripts/sonar/opencode.ci.json`](../../scripts/sonar/opencode.ci.json)  
Prompt del agente fixer: [`.cursor/prompts/sonar-fix-batch-ci.md`](../.cursor/prompts/sonar-fix-batch-ci.md)  
Prompt triage: [`.cursor/prompts/sonar-triage-batch-ci.md`](../.cursor/prompts/sonar-triage-batch-ci.md)

## Iteración manual (desarrollo)

Mismo prompt que usa el harness interactivo: [`.cursor/prompts/sonar-fix-batch.md`](../.cursor/prompts/sonar-fix-batch.md)

```
/loop 1d @.cursor/prompts/sonar-fix-batch.md
```

## Validación Jenkins

Tras merge a `main`:

1. Build manual de `dome-quality-loop` (default `SONAR_BATCH_SIZE=3`) para pruebas
2. Confirmar stage *Agent fix (OpenCode)* verde y `verify-loop-diff.sh` sin falsos positivos
3. PR auto-merge solo si CI pasa — **no confiar en auto-merge hasta 1 run verde**

## Preventing regressions (P-011)

Agents and CI share a living catalog of anti-patterns learned from Sonar batches:

- [sonar-clean-code.md](./sonar-clean-code.md)
- Cursor rule `.cursor/rules/sonar-clean-code.mdc` (`alwaysApply`)
- `pnpm run check:sonar-patterns` (strict full-tree) + `--diff=origin/main` (progressive on PR)
- `pnpm run test:sonar-patterns`

When a batch discovers a new recurring smell, extend the doc + checker + tests in the same PR that fixes it.

## Quality Gate

Ver [sonar-quality-gate.md](./sonar-quality-gate.md) y [sonar-hotspots-and-coverage.md](./sonar-hotspots-and-coverage.md) (Coverage + Hotspots Reviewed).
