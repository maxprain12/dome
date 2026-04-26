# Modelo de recursos para KB LLM (wiki compilada)

Este documento define cómo modelar en Dome un flujo **raw → wiki compilada → Q&A → outputs**, alineado con el esquema actual de recursos (`resources`, `resource_links`, FTS5 e índice semántico con embeddings).

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

- **FTS5** se actualiza en cada guardado de contenido indexable.
- **Índice semántico** (embeddings Nomic + transcripción/descr. por IA en la nube para PDF/imagen): puede quedar desfasado si el contenido cambia sin reindexar — mitigar con `reindexOnSave` o jobs programados — ver [indexing.md](./indexing.md).

## Referencias de código

- IPC recursos: `[electron/ipc/database.cjs](../electron/ipc/database.cjs)`, `[electron/ipc/resources.cjs](../electron/ipc/resources.cjs)`
- Indexación: `[electron/semantic-index-scheduler.cjs](../electron/semantic-index-scheduler.cjs)`, `[electron/services/indexing.pipeline.cjs](../electron/services/indexing.pipeline.cjs)`
- Herramientas de agente: `[electron/ai-tools-handler.cjs](../electron/ai-tools-handler.cjs)`

