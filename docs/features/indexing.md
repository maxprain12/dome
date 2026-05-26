# Indexación semántica (embeddings configurables)

Dome indexa recursos con **embeddings vía LangChain** (OpenAI, Google Gemini u Ollama), almacenados en **LanceDB** (`userData/dome-lance`), y **búsqueda híbrida** (vectores + FTS en Lance + grafo). El texto de PDFs e imágenes proviene del **LLM en la nube** del usuario (visión / multimodal).

## Configuración

**Ajustes → IA → Embeddings**: proveedor, modelo y API key (independientes del chat). Al cambiar proveedor o modelo, Dome borra los vectores y ofrece reindexar la biblioteca.

## Pipeline

1. **resource-text** / transcripción PDF (cloud) / caption+OCR imagen
2. **chunking.cjs**
3. **embeddings.service.cjs** (LangChain) → vectores
4. **lancedb-semantic.cjs** → tabla `semantic_chunks`

## IPC

- `db:semantic:*` — grafo, búsqueda, reindex, estado
- `embeddings:test`, `embeddings:apply`, `embeddings:getStatus`

Ver [ipc.md](./ipc.md) y [settings.md](./settings.md).
