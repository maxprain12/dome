# Sonar quality loop — Jenkins + Dome harness

Automated correction loop: SonarQube → GitHub Issues → Dome agent (MiniMax) → PR.

## Architecture

| Component | Role |
|-----------|------|
| Jenkins `dome-sonar` | Sonar analysis on push to `main` |
| Jenkins `dome-quality-loop` | Cron ~6h: sync issues, pick batch, mechanical fix, **Dome harness**, PR |
| Dome CLI | `pnpm run sonar:run-agent` — Electron headless + `@dome/agent-core` + MiniMax |

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

Los stages Sonar usan `withSonarQubeEnv('SonarQube')`, no la credential suelta `sonar`.

**Local / fallback:** exporta `SONAR_TOKEN` (user token de SonarQube → My Account → Security). La Web API usa **Basic auth** (`token:` como login). Solo SonarQube ≥ 10.6 acepta `Bearer`; opcional `SONAR_AUTH_SCHEME=bearer`.

El pipeline mapea `minimax-api-key` → env `MINIMAX_API_KEY`.

### Modelo MiniMax (opcional)

Variables de entorno en el job (Environment / pipeline):

| Variable | Default |
|----------|---------|
| `SONAR_LOOP_MODEL` | `MiniMax-M2.7-highspeed` |
| `SONAR_LOOP_PROVIDER` | `minimax` |
| `SONAR_LOOP_TIMEOUT_MS` | `900000` (15 min) |

### Agente Jenkins (Linux)

El pipeline ejecuta **`scripts/jenkins/bootstrap-agent-tools.sh`** + **`agent-preflight.sh`** al inicio:

| Herramienta | Comportamiento |
|-------------|----------------|
| `git`, `curl` | deben existir en la imagen (Jenkins estándar) |
| **`gh`** | `apt-get` si hay root/sudo; si no, **descarga portable** a `.jenkins-tools/bin/` |
| **`xvfb`** | `apt-get` si hay root/sudo; si no, warning (Electron usa `no-sandbox`) |
| Node/pnpm | bootstrap en stage Setup |

No hace falta instalar `gh` a mano en el agente salvo que `apt` y la descarga fallen (sin red).

## Flujo del pipeline

1. Sync Sonar → GitHub issues (`pnpm run sonar:sync-github`)
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
pnpm run sonar:run-agent -- --batch=.quality-loop/batch.json --model MiniMax-M2.7-highspeed
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
