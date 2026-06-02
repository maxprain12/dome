# Agent benchmark harness (LangGraph)

Suite en cascada para validar **cada tool** del agente Many/LangGraph y comparar modelos (MiniMax, OpenRouter).

## Requisitos

- Node.js ≥ 22.13, pnpm 11
- `pnpm install` en el repo Dome
- API key en `.env`:

```bash
MINIMAX_BENCH_API_KEY=sk-...
# Opcional fase comparativa:
OPENROUTER_BENCH_API_KEY=sk-or-...
```

El perfil aislado vive en `~/.dome-bench` (no toca `~/.dome`).

### Objetivo del harness

Medir y endurecer **Dome** (catálogo de tools + LangGraph), no “si MiniMax improvisa bien”. Reglas:

1. **Catálogo completo** — cada entrada de `TOOL_HANDLER_MAP` debe existir en `getAllToolDefinitions()` (`pnpm run check:tool-coverage`).
2. **Un caso = una tool** — `tool-scope.cjs` expone solo la tool del caso (+ helpers mínimos).
3. **Sin deepagents filesystem en bench** — perfil `bench` en `agent-middleware.cjs` (sin `ls`/`grep`/`execute` fantasma).
4. **Proveedor-agnóstico** — recuperación de `<invoke>` en texto (`parse-text-tool-invokes.cjs`) para MiniMax; el prompt exige `tool_call` nativo.

### Evitar que el agente explore el repo Dome

- Prompt bench: `electron/bench/bench-prompt.cjs` (solo `bench-project`, sin analizar `Documents/dome`)
- Tools acotadas: `electron/bench/tool-scope.cjs` (~1–5 tools por caso, no el catálogo completo)
- Filesystem de prueba: `~/.dome-bench/bench-sandbox/` para casos `file_*`
- `forbidden_tools` en cada JSON — penaliza `project_list`, `shell_exec`, etc. fuera de contexto

## Comandos

```bash
# Generar ~90 casos JSON desde TOOL_HANDLER_MAP
node scripts/bench/generate-cases.mjs

# Seed fixtures (proyecto bench-project + PDF/XLSX/notas)
pnpm run bench:seed

# Ejecutar suite (MiniMax por defecto)
pnpm run bench:run

# Filtros
pnpm run bench:run -- --grep web
pnpm run bench:run -- --grep 'generate_|ui_|file_'   # alternancia con |
pnpm run bench:run -- --category studio,ui,file      # por carpeta/categoría
pnpm run bench:run -- --case web_search.basic
pnpm run bench:run -- --mode direct
pnpm run bench:run -- --provider openrouter --model anthropic/claude-3.5-sonnet
pnpm run bench:run -- --concurrency 1 --no-judge

# Limpiar perfil bench
pnpm run bench:clean

# Regenerar report desde results.json
pnpm run bench:report -- --run 2026-05-28T11-30-00Z

# Comparar dos runs (MiniMax vs OpenRouter)
pnpm run bench:compare -- --a <runA> --b <runB>
```

## Salida

Cada run escribe en `docs/bench/runs/<ISO8601>/`:

| Archivo | Contenido |
|---------|-----------|
| `manifest.json` | provider, model, git SHA, flags |
| `summary.json` | pass_rate, avg_score, tools_failed |
| `report.md` | Tabla legible |
| `failures.md` | Solo fallos con preview |
| `cases/<id>.json` | Trazas completas (chunks, tools, judge) |

## Validación (3 capas)

1. **Execution** — terminó con chunk `done`, sin timeout/error
2. **Structural** — `expected_tools` ⊆ tools llamadas; `output_shape`
3. **LLM-as-judge** — score 0–5 (pass ≥ 3), mismo provider del run

Casos `optional: true` (UI, browser tab, etc.) → `SKIP` si fallan por entorno headless.

## Arquitectura

```
scripts/bench/run.mjs → electron electron/bench/main.cjs
  → database + runEngine.init
  → seedFixtures
  → invokeLangGraphAgent (por caso)
  → validators + judge
  → JSONL en docs/bench/runs/
```

Ver también [WORKFLOW.md](./WORKFLOW.md) para runs completos MiniMax/OpenRouter y comparativas.

## Depurar un fallo

1. Abre `docs/bench/runs/<run>/failures.md`
2. Abre `cases/<caseId>.json` y revisa `chunks` (`tool_call`, `tool_result`, `error`)
3. Pásame el `caseId` y el run timestamp en el chat

## Casos supervisor

En `scripts/bench/cases/subagent/` — modo `supervisor` sin `toolDefinitions`, delega a `call_*_agent`.
