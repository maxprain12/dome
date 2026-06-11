# T05 — Modularizar run-engine.cjs

**Prioridad**: P2 · **Severidad**: Media · **Esfuerzo**: L · **Área**: Harness

## Problema

`electron/agents/run-engine.cjs` tiene 2.305 líneas y al menos cuatro responsabilidades distintas:

1. Orquestación de workflows DAG (`executeWorkflowRun`, `topologicalLevels`, ejecución por niveles con paralelismo).
2. Ejecución/retry de nodos (`executeWorkflowNode`, retry con backoff, ~línea 1640).
3. Gestión del ciclo de vida de runs individuales (contextos, abort, persistencia de estado a SQLite, HITL).
4. Streaming TTS dentro de runs.

Mismo patrón que otros monolitos del repo (`database.cjs` 4.978, `ai-tools-handler.cjs` 4.153, `tool-dispatcher.cjs` 2.582). El acoplamiento hace que cualquier cambio toque el archivo entero y dificulta el testing de [T01](T01-tests-agent-core.md).

## Qué hay que hacer

1. **No reescribir: extraer.** Dividir en módulos dentro de `electron/agents/` manteniendo `run-engine.cjs` como fachada que re-exporta la API pública actual (los handlers IPC y automation-service no deberían notar el cambio):
   - `workflow-dag.cjs` — `topologicalLevels` y validación del grafo (funciones puras → primeras en tener tests).
   - `workflow-executor.cjs` — `executeWorkflowRun` / `executeWorkflowNode` / retry.
   - `run-lifecycle.cjs` — `activeRunContexts`, abort, persistencia de estado del run, HITL pause/resume (coordinar con [T04](T04-cleanup-run-contexts.md)).
   - `run-tts.cjs` — el streaming TTS.
2. Hacerlo en 3-4 PRs (una extracción por PR), cada uno verificado con: ejecutar un workflow multi-nodo, un run simple desde la Runs UI, una automation, y un abort a mitad.
3. Aprovechar cada extracción para añadir los tests correspondientes de la pieza extraída (el DAG es trivial de testear una vez separado).
4. Documentar el resultado en `docs/architecture/agent-runtime.md` (diagrama de módulos actualizado).

## Criterios de aceptación

- [ ] Ningún módulo resultante supera ~800 líneas.
- [ ] La API pública consumida por `electron/ipc/agents/*` y `automation-service.cjs` no cambia.
- [ ] Workflows, runs, automations, abort y HITL resume funcionan igual (smoke test por PR).
- [ ] `workflow-dag.cjs` con tests unitarios.

## Riesgos / notas

- Hacer **después** de T01 (tests primero) y de T04 (para no mover código que va a cambiar).
- `database.cjs` y `ai-tools-handler.cjs` tienen tareas equivalentes en el área 05 — usar el mismo patrón de fachada.
