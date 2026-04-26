# Indexación semántica (IA en la nube + Nomic)

Dome indexa recursos localmente con **embeddings Nomic** en SQLite (`resource_chunks`) y **búsqueda híbrida** (vectores + FTS5 + grafo). El texto de PDFs e imágenes para el índice proviene del **LLM en la nube** del usuario (visión / multimodal), materializado en `resource_transcripts` y chunks.

## Flujo

1. Un recurso se crea o actualiza → el **semantic-index-scheduler** programa trabajo.
2. `indexing.pipeline.cjs` obtiene texto:
   - **Notas / URL / documentos**: `resource-text.getIndexableText`
   - **PDF**: transcripción página a página con el **LLM en la nube** configurado en Ajustes → IA (marcadores `<!-- page:N -->`); caché en `resource_transcripts`
   - **Imagen**: caption + OCR vía el mismo **LLM con visión** (proveedor del usuario)
3. **chunking.cjs** trocea el texto; los chunks pueden llevar `page_number`.
4. **embeddings.service** (Nomic q8) genera vectores **en local** (sin cambios).
5. SQLite: `resource_chunks` (+ relaciones semánticas según configuración).
6. **hybrid-search** combina resultados (chunks + grafo + FTS) con RRF.

## Tablas SQLite relevantes

| Tabla | Uso |
|--------|-----|
| `resource_chunks` | Texto del chunk, embedding, `page_number` opcional |
| `resource_transcripts` | Transcripciones por página (caché PDF; origen: modelo cloud) |
| `resources.content` | Transcript / texto largo del recurso cuando aplica |

## IPC

- `db:semantic:*` — indexación, estado, búsqueda semántica, progreso `semantic:progress`
- `cloud:llm:pdf-region-stream` (+ eventos `cloud:llm:stream-chunk` / `cloud:llm:stream-done`) — Q&A por región PDF en Many (visión, streaming)
- `indexing:full-sync` — reindexa la biblioteca (solo pipeline semántico)
- `pdf:render-page` / `ai:tools:pdfRenderPage` — renderizar una página PDF a PNG (`dome-pdf-page:` en markdown)

## Herramientas de agente

- `resource_semantic_search` — devuelve `chunk_id`, `page_number`, snippet, score
- `resource_get_section` — por `chunk_id`
- `pdf_render_page` — vista visual de una página

Ver también: [manual-tecnico.md](../manual-tecnico.md) (arquitectura general), [settings.md](./settings.md) (ajustes de UI).
