# Sonar quality loop — Jenkins + Dome harness

Automated correction loop: SonarQube → GitHub Issues → Dome agent (MiniMax) → PR.

## Architecture

| Component | Role |
|-----------|------|
| Jenkins `dome-sonar` | Sonar analysis on push to `main` |
| Jenkins `dome-quality-loop` | Cron ~6h: sync issues, pick batch, mechanical fix, **Dome harness**, PR |
| Dome CLI | `pnpm run sonar:run-agent` — `@dome/agent-core` + MiniMax (Node en CI; Electron en local) |

## Jenkins setup

### Job `dome-quality-loop`

- Pipeline from SCM → **`Jenkinsfile.quality-loop`**
- Branch `*/main`
- Cron incluido en el pipeline (`H */6 * * *`)

### Credentials (Manage Jenkins → Credentials)

| ID Jenkins | Tipo | Uso |
|------------|------|-----|
| **SonarQube server `SonarQube`** | Plugin (Manage Jenkins → SonarQube) | Token para Web API (`SONAR_AUTH_TOKEN`) — **mismo que job `dome-sonar`** |
| **`github-quality-loop`** | GitHub PAT | `repo` + issues/PRs (`GITHUB_TOKEN`) |
| **`minimax-api-key`** | Secret text | API MiniMax (`MINIMAX_API_KEY`) |
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
| `SONAR_LOOP_MODEL` | `MiniMax-M3` (1M context; evita límite ~2k de M2.7-highspeed) |
| `SONAR_LOOP_PROVIDER` | `minimax` |
| `SONAR_LOOP_TIMEOUT_MS` | `900000` (15 min) |

### Agente Jenkins (Linux)

El pipeline ejecuta **`scripts/jenkins/bootstrap-agent-tools.sh`** + **`agent-preflight.sh`** al inicio:

| Herramienta | Comportamiento |
|-------------|----------------|
| `git`, `curl` | deben existir en la imagen (Jenkins estándar) |
| **`gh`** | `apt-get` si hay root/sudo; si no, **descarga portable** a `.jenkins-tools/bin/` |
| **`xvfb`** | opcional (solo si usas harness Electron local en Linux headless) |
| Node/pnpm | bootstrap en stage Setup |
| **Sonar agent (CI)** | `SONAR_LOOP_NODE=1` — harness **Node puro** (`main-node.cjs`), sin binario Electron ni `apt` |
| **better-sqlite3** | `npm rebuild better-sqlite3` en Setup (ABI de Node, no Electron) |

No hace falta instalar `gh` a mano en el agente salvo que `apt` y la descarga fallen (sin red).

### Coolify / contenedor sin root

En Coolify (o cualquier agente Jenkins **sin** `sudo`/`apt`), el pipeline exporta **`SONAR_LOOP_NODE=1`**. El stage *Agent fix* usa el harness **Node puro** (`electron/sonar-loop/main-node.cjs`): mock de `require('electron')`, SQLite con `better-sqlite3` compilado para **Node** (`npm rebuild better-sqlite3`), sin descargar el binario Electron ni instalar `libglib2.0`.

No se requiere `xvfb`, `verify-electron-runtime.sh` ni libs GTK/NSS del sistema.

**Local con el mismo modo que CI:**

```bash
export SONAR_LOOP_NODE=1
npm rebuild better-sqlite3   # una vez, ABI de tu Node (no Electron)
pnpm run sonar:run-agent -- --dry-run
```

**Git commit:** el stage Verify & PR usa `stage-loop-changes.sh` — solo `app/`, `electron/`, `packages/`, `shared/`, `scripts/`, `docs/`. Nunca commitea `.jenkins-node/`, `.jenkins-tools/` ni artefactos del loop.

**Cuándo corre el agente:** stage *Agent fix* solo si `source-tree-clean.sh` (sin diff en código fuente). El `chmod` del preflight u otros artefactos Jenkins **no** deben saltarse el agente. Si el fix mecánico (`void`) ya modificó archivos, el agente se omite a propósito y Verify & PR usa esos cambios.

## Flujo del pipeline

1. Sync Sonar → GitHub issues (`pnpm run sonar:sync-github`) — mantiene **máx. 50 issues abiertas** con `sonarKey`; no crea más hasta que se cierren
2. Pick batch → `.quality-loop/batch.json`
3. Fix mecánico (`void` operator) si aplica
4. **Agent fix** — `pnpm run sonar:run-agent` (MiniMax via Dome harness)
5. Si hay diff → typecheck, lint, coverage → branch + PR (**auto-merge squash** cuando pase CI)
6. Close resolved en Sonar

### Auto-merge de PRs

Tras `gh pr create`, el script `create-batch-pr.mjs` ejecuta `gh pr merge --auto --squash`. El merge ocurre cuando pasen los checks de GitHub Actions (igual que el flujo de [AGENTS.md](../../AGENTS.md)).

Requisitos en el repo **maxprain12/dome**:

- **Settings → General → Allow auto-merge** activado
- Branch protection en `main` con status checks requeridos (CI)

## Probar localmente

```bash
# Token MiniMax (mismo nombre que Jenkins)
export MINIMAX_API_KEY=sk-...

# Batch de prueba
pnpm run sonar:pick-batch -- --size=3 --out=.quality-loop/batch.json

# Dry run (sin API)
pnpm run sonar:run-agent -- --dry-run

# Run real
pnpm run sonar:run-agent -- --batch=.quality-loop/batch.json --model MiniMax-M3
```

Perfil SQLite aislado: `~/.dome-sonar-loop` (no toca `~/.dome`).

## Scripts

```bash
pnpm run sonar:fetch-issues
pnpm run sonar:sync-github
pnpm run sonar:pick-batch
pnpm run sonar:run-agent
pnpm run sonar:close-resolved
```

## Iteración manual (desarrollo)

Mismo prompt que usa el harness: [`.cursor/prompts/sonar-fix-batch.md`](../.cursor/prompts/sonar-fix-batch.md)

```
/loop 1d @.cursor/prompts/sonar-fix-batch.md
```

## Quality Gate

Ver [sonar-quality-gate.md](./sonar-quality-gate.md).
