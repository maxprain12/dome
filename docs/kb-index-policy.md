# Política de indexación incremental (FTS5 vs PageIndex)

Dome mantiene dos capas de recuperación sobre el mismo contenido:

1. **FTS5** (SQLite): actualización automática vía triggers al insertar/actualizar recursos indexables.
2. **PageIndex**: árbol por documento en `resource_page_index`, usado por búsqueda razonada / `memory_search` y herramientas que leen estructura.

## Problema: deriva tras ediciones frecuentes

En el flujo **wiki compilada por LLM**, el modelo puede actualizar notas muchas veces. El comentario histórico en `db:resources:update` advertía coste de *embeddings* en cada guardado; el stack actual usa **PageIndex** (no LanceDB para RAG principal). Aun así, reindexar en **cada** tecla seguiría siendo costoso.

## Política recomendada


| Situación                                                                    | Acción                                                                                                                                                                             |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nota normal, edición humana ocasional                                        | Sin reindex automático; FTS sigue siendo la fuente principal para `resource_search`.                                                                                               |
| Página wiki mantenida por agente (`metadata.dome_kb.reindexOnSave === true`) | Tras `db:resources:update`, programar **debounced** reindex (`resource-indexer.scheduleIndexing`, 2s) solo si el tipo es indexable (`pdf`, `note`, `document`, `url`, `notebook`). |
| Importación masiva / migración                                               | Usar `pageindex:index-missing` o flujos IPC existentes según `[pageindex.md](./pageindex.md)`.                                                                                     |
| Salud del corpus                                                             | Automatización programada que recorra recursos con `wikiRole: compiled` y valide coherencia (ver prompts en `[prompts/kb-wiki-health.md](../prompts/kb-wiki-health.md)`).          |


## Implementación en código

- Si `dome_kb.reindexOnSave` es `true` en el recurso fusionado tras un update, el main process llama a `scheduleIndexing` (misma cola debounced que en creación).
- Los tipos no indexables (`image`, `video`, etc.) no se ven afectados.

## Operaciones manuales

- Reindexación explícita desde la UI o IPC `pageindex:`* cuando se sospecha desincronización.
- Para preguntas que dependen de `memory_search`, si PageIndex está obsoleto, el sistema puede hacer **fallback a FTS** (comportamiento ya presente en `resourceSemanticSearch`).

## Referencias

- `[electron/ipc/database.cjs](../electron/ipc/database.cjs)` — handler `db:resources:update`
- `[electron/resource-indexer.cjs](../electron/resource-indexer.cjs)` — `shouldIndex`, `scheduleIndexing`, debounce 2s
- `[electron/ai-tools-handler.cjs](../electron/ai-tools-handler.cjs)` — `resourceSemanticSearch`