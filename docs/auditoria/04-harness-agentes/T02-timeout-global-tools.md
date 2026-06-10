# T02 — Timeout configurable por tool en el harness

**Prioridad**: P1 · **Severidad**: Media · **Esfuerzo**: S · **Área**: Harness
**Estado**: ✅ Implementada (verificación de código 2026-06-10) — `tool-dispatcher.cjs`: `DEFAULT_TOOL_TIMEOUT_MS` (120s, configurable vía `DOME_TOOL_TIMEOUT_MS`) + `TOOL_TIMEOUT_OVERRIDES` (transcribe 600s, notebook/ppt 300s, web_fetch 90s…) con wrapper sobre `executeToolInMain`. Pendiente menor: test unitario del wrapper y verificar que las tools en espera HITL no consumen timeout.

## Problema

No hay timeout global de ejecución de tools en el harness (`agent-runtime.cjs` / `@dome/agent-core`). Cada tool gestiona (o no) sus propios timeouts. Si una tool se cuelga (fetch sin timeout, proceso externo zombie, espera de disco), el run queda parado indefinidamente y la única salida es que el usuario cancele manualmente. En workflows/automations desatendidos ni siquiera hay usuario mirando.

## Qué hay que hacer

1. Añadir un timeout por ejecución de tool en el punto único de despacho — el hook before/after tool del harness en `agent-runtime.cjs` o el wrapper de `executeToolInMain` (`electron/tools/tool-dispatcher.cjs`): `Promise.race` entre la tool y un timer; al vencer, abortar (si la tool acepta signal) y devolver un tool_result de error claro (`"Tool X timed out after Ns"`) para que el modelo pueda reaccionar.
2. Default razonable: 120s. Overrides por tool en un mapa (igual estilo que `CREATION_TOOL_CAPS` en `agent-runtime.cjs:42-63`): tools largas legítimas (transcripción, `notebook_run_cell`, `ppt_create`, indexación) con límites mayores; tools de lectura con límites menores.
3. Configurable vía env (`DOME_TOOL_TIMEOUT_MS`) y/o setting para debugging.
4. Propagar un `AbortSignal` hijo a las tools que ya aceptan signal para que el timeout cancele de verdad el trabajo (no solo lo abandone).
5. Telemetría: loguear timeouts con nombre de tool y duración (entrada para el logging estructurado de [06/T02](../06-calidad-observabilidad/T02-logging-estructurado.md)).

## Criterios de aceptación

- [ ] Una tool de prueba que duerme 10 min produce un tool_result de error a los 120s y el run continúa o termina limpio.
- [ ] El timeout no mata runs legítimos de transcripción/notebook (overrides funcionando).
- [ ] El abort por timeout no deja procesos hijos huérfanos en las tools con signal.
- [ ] Test unitario del wrapper de timeout (encaja en la suite de [T01](T01-tests-agent-core.md)).

## Riesgos / notas

- Devolver error al modelo (no lanzar excepción al loop) es importante: el agente puede reintentar o cambiar de estrategia.
- Las tools HITL en espera de aprobación **no** deben contar contra el timeout — el reloj corre solo durante la ejecución.
