# 04 — Harness de Agentes

Auditoría del runtime de agentes (`@dome/agent-core`, `electron/agents/agent-runtime.cjs`, `run-engine.cjs`, sistema de tools). Fecha: 2026-06-09.

## Resumen

El harness es arquitectónicamente sólido: los gaps documentados en `docs/architecture/agent-runtime.md` (HITL resume, subagents de Many, Agent Team, mantenimiento de sesiones, merge de tools MCP) están **implementados y verificados** en el código. AbortController bien manejado (cleanup en finally, `{ once: true }`), compaction con fallback gracioso.

Riesgos detectados:

- **Cero tests** del núcleo (~2.130 LoC en `packages/agent-core`, un único test de 18 líneas) — ver también [06/T01](../06-calidad-observabilidad/T01-tests-en-ci.md).
- **Sin timeout por tool**: una tool colgada bloquea el run hasta que el usuario cancele.
- **HITL/caps incompletos**: 6 tools con approval y 13 con caps, de 157 totales; `resource_update` permite 30 mutaciones sin aprobación.
- `activeRunContexts` (run-engine) sin cleanup explícito en el success path.
- `run-engine.cjs` monolítico (2.305 líneas: DAG + agent loop + HITL + TTS streaming).

## Tareas

| Tarea | Prioridad | Esfuerzo | Estado |
|-------|-----------|----------|--------|
| [T01 — Suite de tests para agent-core](T01-tests-agent-core.md) | P0 | L | ✅ Implementada (39 tests) |
| [T02 — Timeout configurable por tool](T02-timeout-global-tools.md) | P1 | S | ✅ Implementada |
| [T03 — Ampliar HITL y caps de tools](T03-ampliar-hitl-y-caps.md) | P1 | M | ✅ Implementada |
| [T04 — Cleanup de activeRunContexts](T04-cleanup-run-contexts.md) | P2 | S | ✅ Implementada |
| [T05 — Modularizar run-engine.cjs](T05-modularizar-run-engine.md) | P2 | L | ⬜ Pendiente |

> **Validación 2026-06-10**: T01 — suite real con mock de modelo: 20 tests del agent loop + 8 de compaction + 7 de skills (41 en total, en CI). T02 (timeout 120s + overrides), T03 (cap global 200/run, cap default 50/tool, umbral HITL para `resource_update`, con 8 tests de policy) y T04 (`releaseRunContext`) implementadas. Solo queda T05, el refactor multi-PR del run-engine — ahora con red de tests.
>
> **Bug fix post-smoke-test (2026-06-10)**: el interrupt HITL llegaba al chat como tool result de error ("HITL interrupt") en vez de pausar el run — `prepareToolCall` (agent-loop), `emitRunFailure` y `normalizeHarnessError` (agent-harness) tragaban/envolvían el throw. Fix: contrato `isAgentInterrupt` que atraviesa las tres capas (con 2 tests nuevos en agent-loop), y `hitlApproved` en el toolContext del resume para que `shell_exec` no pida una segunda aprobación con su diálogo propio.

## Lo que ya está bien

- HITL resume completo: `resumeDomeAgent()` en `agent-runtime.cjs:724-863` (decision approval + continueRun).
- Subagents (`subagents-native.cjs`, `buildTaskTool()`) y Agent Team (`buildDelegateToAgentTool()`) nativos.
- Abort/signal handling robusto: listener `{ once: true }`, `removeEventListener` en cleanup (`agent-runtime.cjs:684-712`).
- Retry con detección de errores de timeout/conexión en nodos de workflow (`run-engine.cjs:~1640`).
- Validación Zod en IPC de threads; normalización estricta de inputs de tools (`tool-input-normalize.cjs`).
- Caps de creación: `CREATION_TOOL_CAPS` (`agent-runtime.cjs:42-63`).
- CI con checks defensivos: `check:tool-coverage`, `check:ipc-zod`, depcruise, architecture guard.

## Orden recomendado

T01 primero (los demás cambios al harness necesitan red de seguridad). T02 y T04 son pequeños y pueden ir en paralelo. T05 después de T01 (refactor grande sin tests = riesgo).
