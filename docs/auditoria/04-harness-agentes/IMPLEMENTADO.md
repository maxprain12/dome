# 04 — Harness de agentes — Implementación y validación

**Rama:** `fix/auditoria-seguridad-p0-p2` · **Fecha:** 2026-06-09

## Resumen

| Tarea | Estado | Notas |
|-------|--------|-------|
| T01 Tests agent-core | ✅ | Vitest con mock de modelo: 18 loop + 8 compaction + 7 skills = **39 tests** en `packages/agent-core/test/` |
| T02 Timeout por tool | ✅ | `tool-dispatcher.cjs` Promise.race, default 120s |
| T03 Ampliar HITL/caps | ✅ | Cap global 200/run + cap default 50/tool + umbral HITL para `resource_update`/`artifact_merge_data` (8 tests) |
| T04 Cleanup run contexts | ✅ | `releaseRunContext()` + scrub apiKey |
| T05 Modularizar run-engine | ✅ | Fase 2: `workflow-dag`/`store`/`executor`/`lifecycle`/`helpers`; 2.317→1.310 líneas (13 tests) |

## Archivos clave

- `electron/tools/tool-dispatcher.cjs` — timeout wrapper
- `electron/agents/run-engine.cjs` — `releaseRunContext`
- `packages/agent-core/test/exports.test.ts`, `test/types.test.ts`

## Cómo validar

```bash
pnpm --filter @dome/agent-core run test
pnpm run test:security   # incluye policy/url; harness en agent-core aparte

# Timeout manual: tool de prueba que sleep 10min → error a ~120s (configurable DOME_TOOL_TIMEOUT_MS)

# Context cleanup: tras runs completados, log dev no debe mostrar activeRunContexts.size > 20 repetido
```

## Pendiente

- T01: tests de loop/HITL/compaction con mock LLM
- T03: ampliar `CREATION_TOOL_CAPS` y política HITL
- T05: extraer módulos DAG/topology de `run-engine.cjs`
