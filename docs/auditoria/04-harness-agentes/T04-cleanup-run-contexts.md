# T04 — Cleanup de activeRunContexts en el success path

**Prioridad**: P2 · **Severidad**: Media · **Esfuerzo**: S · **Área**: Harness
**Estado**: ✅ Implementada (verificación de código 2026-06-10) — nuevo `releaseRunContext(runId, { force })` en `run-engine.cjs`: limpia `apiKey`, respeta runs en `waiting_approval` (HITL) y reemplaza los `delete` sueltos en todos los caminos de terminación. Pendiente menor: TTL para pausas HITL eternas (paso 2) y métrica de `activeRunContexts.size`.

## Problema

En `electron/agents/run-engine.cjs` (~línea 340-360) cada run registra su contexto:

```js
const context = { runId, provider, model, apiKey, baseUrl, controller: new AbortController(), steps: [...] };
activeRunContexts.set(runId, context);
```

El cleanup (`activeRunContexts.delete(runId)`) solo está garantizado en los caminos de error/abort; en el success path típico la entrada parece quedarse. Cada contexto retiene `steps` (potencialmente grandes), el `AbortController` y la API key. En una sesión larga con automations periódicas, el Map crece sin límite → memory leak y secretos retenidos en memoria más de lo necesario.

Relacionado: `setMaxListeners(64, controller.signal)` en `run-engine.cjs:~1360` sin justificación documentada — síntoma de que se acumulan listeners sobre el mismo signal.

## Qué hay que hacer

1. Localizar todos los puntos de terminación de run en `run-engine.cjs` (success, error, abort, HITL-pause) y centralizar el cleanup en un `finally` del camino principal: `activeRunContexts.delete(runId)` + `controller.abort()` defensivo si quedan trabajos hijos.
2. Caso especial HITL: un run pausado esperando aprobación **debe** conservar su contexto. Marcar el estado (`paused`) y limpiar solo en terminal (completed/failed/cancelled). Añadir un TTL de seguridad para pausas eternas (p. ej. limpiar y marcar failed tras 24h, configurable).
3. Revisar los listeners sobre `controller.signal`: si cada nodo de workflow añade el suyo, quitarlos al terminar el nodo (o usar `{ once: true }`); después, bajar o eliminar el `setMaxListeners(64)` y documentar el valor si sigue haciendo falta.
4. Métricas de sanidad: loguear `activeRunContexts.size` al inicio de cada run (visible con el logging de [06/T02](../06-calidad-observabilidad/T02-logging-estructurado.md)); en dev, warning si supera p. ej. 20.

## Criterios de aceptación

- [ ] Tras N runs completados con éxito, `activeRunContexts.size === 0` (verificable con un log o test).
- [ ] Un run pausado por HITL conserva el contexto y reanuda bien; uno expirado se limpia.
- [ ] Sin warnings de MaxListeners con workflows de 10+ nodos.

## Riesgos / notas

- Cuidado con el resume HITL después de reinicio de app: si el contexto vive solo en memoria, el TTL/limpieza debe ser coherente con cómo `resumeDomeAgent` reconstruye el estado desde SQLite.
