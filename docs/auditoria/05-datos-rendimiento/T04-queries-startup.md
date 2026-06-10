# T04 — Revisar queries y cargas completas en el arranque

**Prioridad**: P3 · **Severidad**: Baja · **Esfuerzo**: S · **Área**: Rendimiento
**Estado**: 🔶 Parcial (2026-06-10) — auditadas las queries: todas las de listado de runs ya tienen `LIMIT` (`database.cjs:3918-3945`); el único `.all()` sin límite (`getWorkflowRunIds`, usado en cada `threads:list`) ahora se cachea con TTL de 30s en `ipc/agents/threads.cjs`. Pendiente: política de retención/purga del histórico de runs (punto 3) — feature aparte.

## Problema

Hay cargas sin filtro al iniciar, p. ej. `queries.getWorkflowRunIds.all()` en `electron/agents/run-engine.cjs:71` — carga todos los run IDs históricos en cada arranque. Con meses de automations periódicas, esa tabla crece sin límite y el arranque (y la memoria) pagan el coste. Probablemente haya más patrones `.all()` sin LIMIT en rutas de arranque o en vistas que solo muestran los N más recientes.

## Qué hay que hacer

1. Auditar los `.all()` de arranque: `grep -rn "\.all()" electron/ --include='*.cjs'` y clasificar cuáles corren en init/arranque o en hot paths con tablas que crecen sin límite (runs, run steps, interactions, study_events).
2. Para cada uno: añadir `LIMIT`/filtro por estado o fecha según lo que el consumidor necesite (p. ej. solo runs activos/pausados al arrancar, no el histórico).
3. **Retención**: definir política para tablas de histórico (runs y steps de automations, eventos) — p. ej. conservar 90 días o N últimos por regla, con purga al arrancar o en idle. Configurable en settings si se quiere.
4. Medir antes/después: tiempo de `app ready → ventana interactiva` con una DB grande (generar fixture con 50k runs).

## Criterios de aceptación

- [ ] Ningún `.all()` sin límite sobre tablas de crecimiento ilimitado en rutas de arranque.
- [ ] Política de retención implementada y documentada.
- [ ] Arranque con DB de fixture grande sin regresión perceptible.

## Riesgos / notas

- La purga de runs debe respetar referencias (bindings de artifacts a automations, `automation_artifact_bindings`) — borrar con cuidado de FKs.
- La Runs UI (`RunLogView.tsx`) puede necesitar paginación si hoy asume el histórico completo.
