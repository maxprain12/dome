# Modelo de recursos para KB LLM (wiki compilada)

Este documento define cómo modelar en Dome un flujo **raw → wiki compilada → Q&A → outputs**, alineado con el esquema actual de recursos (`resources`, `resource_links`, FTS en DuckDB vía `fts` extension e índice semántico con embeddings en LanceDB).

## Principios

1. **No hace falta un tipo SQL nuevo**: la wiki es un conjunto de recursos (`note`, `pdf`, `document`, `url`, `notebook`, etc.) más convenciones en `metadata`, carpetas (`folder_id`) y enlaces (`resource_links`).
2. **Separación lógica por rol**: cada recurso participa como *raw*, *compilado*, *índice* o *output* según `metadata.dome_kb.wikiRole`.
3. **Enlaces estables**: preferir `dome://resource/ID` en prompts de agentes; en UI el chat ya resuelve wikilinks — ver [kb-ux-unification](./kb-ux-unification.md) y [resources](./resources.md).

## Metadatos `metadata.dome_kb`

Convención opcional (TypeScript: `DomeKbMetadata` en `[app/types/index.ts](../app/types/index.ts)`):


| Campo             | Tipo      | Descripción                                                                                                                                                    |
| ----------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wikiRole`        | `'raw'    | 'compiled'                                                                                                                                                     |
| `reindexOnSave`   | `boolean` | Si es `true`, tras cada `db:resources:update` el main process puede programar reindexación semántica (debounced) vía `semantic-index-scheduler`. Ver [indexing.md](./indexing.md). |
| `topicId`         | `string`  | Opcional: agrupa artículos de un mismo tema de investigación.                                                                                                  |
| `pipelineVersion` | `string`  | Opcional: versión del prompt/plantilla de compilación (trazabilidad en runs).                                                                                  |


Ejemplo mínimo en una nota compilada:

```json
{
  "dome_kb": {
    "wikiRole": "compiled",
    "reindexOnSave": true,
    "topicId": "ml-interpretability",
    "pipelineVersion": "kb-wiki-v1"
  }
}
```

## Organización en proyecto

- **Carpetas**: usar recursos `folder` para `Raw/`, `Wiki/`, `Outputs/` dentro del mismo proyecto (convención de nombres, no obligatoria).
- **Backlinks y grafo**: Dome ya expone backlinks y grafo por menciones y `resource_links`; los agentes pueden usar herramientas `link_resources` / `get_related_resources` para mantener la red.
- **Conceptos y categorías**: representar como tags en contenido, títulos de sección, o recursos `note` dedicados (`wikiRole: "index"`).

## Relación con FTS e índice semántico

- **FTS en DuckDB** (`fts_main_resources`, `fts_main_resource_interactions`) se actualiza vía `PRAGMA create_fts_index` en la migración 0015_fts y se reindexa con `reindexFts(db, 'resources')` desde `electron/core/db/fts.cjs`. Ver [database.md](./database.md).
- **Índice semántico** (embeddings Nomic/Google/Ollama en LanceDB vía `electron/services/lancedb-semantic.cjs` + transcripción/descr. por IA en la nube para PDF/imagen): puede quedar desfasado si el contenido cambia sin reindexar — mitigar con `reindexOnSave` o jobs programados — ver [indexing.md](./indexing.md).

## Referencias de código

- IPC recursos: `[electron/ipc/data/database.cjs](../electron/ipc/data/database.cjs)`, `[electron/ipc/data/resources.cjs](../electron/ipc/data/resources.cjs)`
- Indexación: `[electron/storage/semantic-index-scheduler.cjs](../electron/storage/semantic-index-scheduler.cjs)`, `[electron/services/indexing.pipeline.cjs](../electron/services/indexing.pipeline.cjs)`
- FTS (DuckDB): `[electron/core/db/fts.cjs](../electron/core/db/fts.cjs)` (`createFtsIndexes`, `reindexFts`)
- Herramientas de agente: `[electron/tools/ai-tools-handler.cjs](../electron/tools/ai-tools-handler.cjs)`

