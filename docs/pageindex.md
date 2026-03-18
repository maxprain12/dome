# PageIndex — Motor de indexación IA

> Motor de búsqueda semántica de Dome (introducido en v2.0.0). Reemplaza LanceDB.
> Ver [vector-db.md](./vector-db.md) para la documentación legacy de LanceDB.

---

## ¿Qué es PageIndex?

PageIndex es el motor que permite a Many y otros agentes de IA **comprender y buscar en tu biblioteca personal** de recursos (notas, PDFs, URLs, etc.).

A diferencia del enfoque tradicional de embeddings + búsqueda vectorial, PageIndex usa un enfoque **reasoning-based**: los recursos se parsean en chunks de texto estructurado, y la búsqueda se realiza mediante razonamiento directo del modelo de lenguaje sobre esa estructura.

### Ventajas sobre LanceDB (v1.x)

| Aspecto | LanceDB (legacy) | PageIndex (v2+) |
|---------|-----------------|-----------------|
| Búsqueda | Embeddings vectoriales (cosine similarity) | Reasoning sobre texto estructurado |
| Modelo requerido | Embedding model específico | Cualquier chat model |
| Offline | Solo con Ollama + embedding model | Cualquier Ollama model |
| Latencia | Rápida (vectorial) | Mayor pero más precisa |
| Comprensión | Similitud semántica | Comprensión contextual |
| Configuración | Necesita modelo embedding | Usa el mismo modelo que el chat |

---

## Tipos de recursos indexados

| Tipo | Fuente | Cómo se procesa |
|------|--------|----------------|
| `pdf` | Archivo PDF | PageIndex Python extrae texto por páginas |
| `note` | Nota Dome (Tiptap JSON) | Convertida a Markdown, luego indexada |
| `document` | Word, texto plano | Texto extraído |
| `url` | Página web guardada | Contenido del artículo procesado |
| `notebook` | Jupyter-style notebook | Celdas markdown/código como texto |

Los tipos `video`, `audio` e `image` **no se indexan** con PageIndex (sin transcripción automática por defecto).

---

## Estados de un recurso

```
┌─────────────┐    scheduleIndexing()    ┌────────────┐
│  unindexed  │─────────────────────────►│  indexing  │
└─────────────┘                          └─────┬──────┘
                                               │ éxito
                                               ▼
                                         ┌───────────┐
                                         │  indexed  │
                                         │ "Listo    │
                                         │  para IA" │
                                         └───────────┘
                                               │ fallo
                                               ▼
                                         ┌───────────┐
                                         │   error   │
                                         └───────────┘
```

El badge **"Listo para IA"** aparece en la cabecera del workspace cuando `status = 'indexed'`.

---

## Arquitectura

```
Renderer
  │
  │ IPC pageindex:*
  ▼
electron/resource-indexer.cjs
  │
  ├── debounce 2s (evita indexar en cada keystroke)
  │
  ├── Para PDFs → electron/docling-pipeline.cjs
  │                      → docling-client.cjs → Docling Serve (HTTP)
  │
  └── Para notas/URLs → electron/pageindex-python.cjs
                              → Python runtime (bundled)
                              → Chunks estructurados
                              → Almacenados en SQLite (pageindex_chunks table)
```

### Python bridge (`electron/pageindex-python.cjs`)

Lanza el runtime Python de PageIndex como proceso hijo. El runtime:
1. Recibe el texto del recurso
2. Lo parsea y divide en chunks significativos
3. Almacena los chunks en la tabla `pageindex_chunks` de SQLite
4. Retorna confirmación al proceso principal

---

## Auto-indexing en background

Dome indexa automáticamente sin intervención del usuario:

1. **Al arrancar**: Tras 15 segundos de warm-up, indexa todos los recursos con `status = 'unindexed'`
2. **Cada hora**: Comprueba si hay recursos nuevos sin indexar
3. **Al guardar**: Al editar o importar un recurso, se programa indexación con debounce de 2 segundos
4. **Al importar de la nube**: Los archivos importados de Google Drive/OneDrive se indexan automáticamente

---

## IPC Channels

| Canal | Parámetros | Respuesta | Descripción |
|-------|-----------|-----------|-------------|
| `pageindex:index` | `resourceId: string` | `{ success, data }` | Indexar un recurso específico |
| `pageindex:status` | `resourceId: string` | `{ status, error? }` | Estado de indexación |
| `pageindex:search` | `{ query, limit? }` | `{ results[] }` | Búsqueda semántica |
| `pageindex:reindex` | `resourceId: string` | `{ success }` | Eliminar y re-indexar |
| `pageindex:indexAll` | — | `{ queued }` | Indexar todos los pendientes |

---

## Configuración

En **Settings → Indexing**:

| Setting | Descripción |
|---------|-------------|
| Provider | Proveedor AI para el razonamiento (usa el proveedor AI global por defecto) |
| Model | Modelo a usar para reasoning (puede ser diferente al del chat) |
| Auto-index | Activar/desactivar indexación automática en background |
| Re-index triggers | Cuándo re-indexar: solo cambios, siempre, manual |

**Recomendación de modelos para PageIndex** (ordenados por calidad):
- `claude-sonnet-4-6` (Anthropic) — Mayor comprensión
- `gpt-4o-mini` (OpenAI) — Buen balance velocidad/calidad
- `llama3.2:3b` (Ollama) — Offline, más rápido
- `qwen2.5:7b` (Ollama) — Offline, mejor calidad que llama3.2

---

## Búsqueda semántica desde Many

Cuando Many recibe una pregunta que requiere buscar en la biblioteca, usa automáticamente:

1. `resource_search` — FTS SQLite (rápido, literal)
2. `resource_semantic_search` — PageIndex reasoning (si está disponible)

Los agentes del sistema (Library Agent, Curator Agent) priorizan PageIndex para respuestas más contextuales.

---

## Troubleshooting

### Los recursos no aparecen como "Listo para IA"

1. Comprueba Settings → Indexing → Auto-index está activado
2. Verifica que el modelo PageIndex está configurado y el proveedor AI es accesible
3. Revisa la consola de desarrollo (`Cmd+Option+I`) para errores del indexer

### Re-indexar todo manualmente

Settings → Indexing → **Re-indexar todo** — Borra los índices existentes y vuelve a procesar todos los recursos.

### Error: "Python runtime not found"

```bash
# Regenerar el runtime
bun run prepare:pageindex-runtime
```

### pageindex_chunks table no existe

Se crea automáticamente en la primera indexación. Si persiste el error, borra y recrea la base de datos:
```bash
bun run clean   # Cuidado: elimina también otros datos de usuario
```

---

*Introducido en Dome v2.0.0. Reemplaza a LanceDB (ver [vector-db.md](./vector-db.md) — deprecated).*
