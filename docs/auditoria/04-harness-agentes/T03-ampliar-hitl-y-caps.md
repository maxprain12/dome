# T03 — Ampliar HITL y caps de tools

**Prioridad**: P1 · **Severidad**: Alta · **Esfuerzo**: M · **Área**: Harness
**Estado**: ✅ Implementada (2026-06-10, versión pragmática) — en `agent-runtime.cjs` `buildBeforeToolCall`: (a) **cap global por run** de 200 tool calls (`DOME_TOOL_CALL_LIMIT`); (b) **cap default por tool** de 50 para tools sin entrada explícita en `CREATION_TOOL_CAPS`; (c) **umbral de mutación** (`MUTATION_HITL_THRESHOLDS`: `resource_update` 5 libres, `artifact_merge_data` 10) — pasado el umbral pide aprobación HITL, y en superficies desatendidas (skipHitl, sin canal de aprobación) **bloquea con razón clara** en vez de colgarse. Tests `tool-call-policy.test.mjs` 8/8 ✓ en `test:security`. No implementado: la clasificación formal `riskLevel` de las 157 tools (puntos 1-2) — la policy actual usa listas; migrar a metadatos queda como mejora futura.

## Problema

De ~157 tools registradas (`getAllToolDefinitions()` en `tool-dispatcher.cjs:853`):

- Solo **6 requieren aprobación HITL** (`HITL_TOOL_NAMES`, `agent-runtime.cjs:~32-39`): `resource_delete`, `artifact_delete`, `feeder_run`, `ppt_create`, `notebook_run_cell`, `shell_exec`.
- Solo **13 tienen caps** (`CREATION_TOOL_CAPS`, `agent-runtime.cjs:42-63`): `resource_create: 20`, `artifact_create: 15`, `ppt_create: 8`, etc.

Huecos concretos:
- `resource_update` puede mutar hasta 30 recursos por run **sin aprobación** — una mala pasada de un agente (o prompt injection desde contenido web) puede sobrescribir notas del usuario en masa.
- No hay cap global de llamadas a tools por run ni de concurrencia: un loop degenerado quema tokens y recursos hasta el límite de iteraciones.
- Tools de escritura a disco / envío externo (export, cloud-sync, calendar write, email si existe) hay que revisarlas una a una.

## Qué hay que hacer

1. **Clasificar las 157 tools** por riesgo (script de una vez sobre `getAllToolDefinitions()`): lectura / creación / mutación / borrado / ejecución / salida-externa. Guardar la clasificación como metadato de la definición (campo `riskLevel`) para que policy y UI la usen.
2. **Política por clase**, no por lista manual:
   - borrado y ejecución → HITL siempre (ya cubierto).
   - mutación masiva: HITL **a partir de un umbral** (p. ej. las primeras 5 `resource_update` libres, la 6ª pide confirmación "el agente quiere seguir modificando recursos") — evita fricción en usos normales y frena los desbocados.
   - salida-externa (publicar, sincronizar, enviar) → HITL.
3. **Cap global por run**: total de tool calls (p. ej. 200) y por-tool default (p. ej. 50) además de los caps específicos. Al alcanzarlo, el harness devuelve error al modelo y termina con estado claro.
4. **Excepciones por superficie**: automations/workflows desatendidos no pueden pedir HITL a nadie → ahí los umbrales se convierten en denegación con log, o el rule define qué pre-aprueba (revisar cómo `run-engine.cjs` maneja hoy la interrupción HITL en runs desatendidos).
5. UI: el diálogo de aprobación debe mostrar qué va a hacer la tool con argumentos resumidos (ya existe para las 6 actuales; extender).
6. Tests de la policy (entra en la suite de [T01](T01-tests-agent-core.md)).

## Criterios de aceptación

- [ ] Toda tool tiene `riskLevel` y la policy se deriva de él (no de listas sueltas).
- [ ] `resource_update` masivo dispara aprobación a partir del umbral.
- [ ] Existe cap global por run y se refleja con mensaje claro al terminar.
- [ ] Automations desatendidas no se quedan colgadas esperando una aprobación imposible.

## Riesgos / notas

- Equilibrio fricción/seguridad: umbrales, no aprobación por cada llamada. Medir con uso real y ajustar.
- `check:tool-coverage` en CI puede extenderse para exigir `riskLevel` en toda tool nueva.
