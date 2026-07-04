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
| **`sonar`** | Secret text | Token SonarQube (`SONAR_TOKEN`) |
| **`github-quality-loop`** | GitHub PAT | `repo` + issues/PRs (`GITHUB_TOKEN`) |
| **`minimax-api-key`** | Secret text | API MiniMax (`MINIMAX_API_KEY`) |

El pipeline mapea `minimax-api-key` → env `MINIMAX_API_KEY`.

### Modelo MiniMax (opcional)

Variables de entorno en el job (Environment / pipeline):

| Variable | Default |
|----------|---------|
| `SONAR_LOOP_MODEL` | `MiniMax-M2.7-highspeed` |
| `SONAR_LOOP_PROVIDER` | `minimax` |
| `SONAR_LOOP_TIMEOUT_MS` | `900000` (15 min) |

### Agente Jenkins (Linux)

El pipeline ejecuta **`scripts/jenkins/agent-preflight.sh`** al inicio:

| Herramienta | Validación |
|-------------|------------|
| `git` | obligatorio |
| `curl` | obligatorio |
| `gh` | obligatorio (+ login con `GITHUB_TOKEN`) |
| Node/pnpm | bootstrap en stage Setup |
| **Xvfb** | auto: `DISPLAY=:99` o fallback `xvfb-run` |

Instalación en el agente (Debian/Ubuntu):

```bash
apt-get update && apt-get install -y git curl gh xvfb
```

Si falta alguna herramienta, el job falla en **Agent preflight** con instrucciones.

## Flujo del pipeline

1. Sync Sonar → GitHub issues (`pnpm run sonar:sync-github`)
2. Pick batch → `.quality-loop/batch.json`
3. Fix mecánico (`void` operator) si aplica
4. **Agent fix** — `pnpm run sonar:run-agent` (MiniMax via Dome harness)
5. Si hay diff → typecheck, lint, coverage → branch + PR
6. Close resolved en Sonar

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
