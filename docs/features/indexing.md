# Indexación semántica (embeddings configurables)

Dome indexa recursos con **embeddings vía LangChain** (OpenAI, Google Gemini u Ollama), almacenados en **LanceDB** (`userData/dome-lance`) como almacén vectorial + espejo FTS léxico, y **búsqueda híbrida** (vectores LanceDB + FTS DuckDB + grafo). El texto de PDFs e imágenes proviene del **LLM en la nube** del usuario (visión / multimodal). El FTS principal (`resources`, `resource_interactions`) vive en DuckDB vía la extensión `fts` (`PRAGMA create_fts_index`); ver [database.md](./database.md).

## Configuración

**Ajustes → IA → Embeddings**: proveedor, modelo y API key (independientes del chat). Al cambiar proveedor o modelo, Dome borra los vectores y ofrece reindexar la biblioteca.

## Pipeline

1. **resource-text** / transcripción PDF (cloud) / caption+OCR imagen
2. `electron/services/chunking.cjs` — split en chunks
3. `electron/services/embeddings.service.cjs` (LangChain) → vectores
4. `electron/services/lancedb-semantic.cjs` → tabla `semantic_chunks` (LanceDB)
5. FTS en DuckDB (`electron/core/db/fts.cjs` → `fts_main_resources`)

## IPC

- `db:semantic:*` — grafo, búsqueda, reindex, estado
- `embeddings:test`, `embeddings:apply`, `embeddings:getStatus`

Ver [ipc.md](./ipc.md) y [settings.md](./settings.md).
