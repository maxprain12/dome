# Workflow post-implementación (fases 7–8)

## Fase 7 — Run completo MiniMax

```bash
# 1. Key en .env
echo 'MINIMAX_BENCH_API_KEY=sk-...' >> .env

# 2. Seed + suite (modo direct, ~103 casos; ~2–4h según rate limits)
pnpm run bench:run -- --provider minimax --mode direct --concurrency 1

# Smoke rápido (1 caso)
pnpm run bench:smoke

# Subconjunto (studio + ui + file)
pnpm run bench:run -- --category studio,ui,file --mode direct
# o: --grep 'generate_|ui_|file_'
```

Revisar `docs/bench/runs/<latest>/failures.md`. Para cada fallo, abrir `cases/<id>.json` y buscar:
- `chunks` con `type: "error"` o `tool_result` con error
- `validation.structural.missing` — tool no invocada
- `validation.judge.score` < 3

Iteración típica:
1. **Caso** — `scripts/bench/generate-cases.mjs` (prompts, `forbidden_tools`, sandbox `~/.dome-bench/bench-sandbox`)
2. **Alcance** — `electron/bench/bench-prompt.cjs` + `tool-scope.cjs` (solo tools del caso, no 87 tools)
3. **Tool handler** — `electron/ai-tools-handler.cjs` / `tool-dispatcher.cjs`
4. **Gap defs** — `generate_guide/faq/timeline/table` en `getAllToolDefinitions()`

### Anti-drift (explorar el repo Dome)

Si el agente lista `Documents/dome` o hace `file_tree` antes de la tool objetivo:
- Regenerar casos: `node scripts/bench/generate-cases.mjs`
- Reseed: `pnpm run bench:seed`
- El harness limita tools por caso; casos `file_*` usan solo `~/.dome-bench/bench-sandbox`

Rescore sin re-ejecutar: `pnpm run bench:rescore -- --run <runId>`

## Fase 8 — OpenRouter + comparativa

```bash
echo 'OPENROUTER_BENCH_API_KEY=sk-or-...' >> .env

pnpm run bench:run -- --provider openrouter --model anthropic/claude-3.5-sonnet --mode direct

# Comparar dos runs
pnpm run bench:compare -- --a 2026-05-28T10-00-00Z --b 2026-05-28T14-00-00Z
```

Salida: `docs/bench/runs/compare-<A>-vs-<B>.md`

## Compartir trazas con el agente en Cursor

Di: *"Mira el caso `web_search.basic` del run `2026-05-28T09-39-46Z`"* — el asistente leerá el JSON completo con todos los chunks.
