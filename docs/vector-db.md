# Base de datos vectorial LanceDB

Dome usa LanceDB para almacenar embeddings de recursos y anotaciones, permitiendo búsqueda semántica.

## Ubicación

**macOS:**
```
~/Library/Application Support/Dome/dome-vector/
```

**Windows:**
```
%APPDATA%/Dome/dome-vector/
```

**Linux:**
```
~/.config/Dome/dome-vector/
```

## Tablas

| Tabla | Contenido |
|-------|-----------|
| `resource_embeddings` | Chunks de documentos indexados (notas, PDFs, URLs, etc.) |
| `annotation_embeddings` | Anotaciones y highlights de PDFs |
| `source_embeddings` | Fuentes y referencias bibliográficas |

## Inspeccionar la base de datos

Cierra Dome antes de conectar para evitar bloqueos. O usa solo lecturas si la app está abierta.

### Node.js

```javascript
const lancedb = require('vectordb');
const db = await lancedb.connect('/Users/<user>/Library/Application Support/Dome/dome-vector');

const tables = await db.tableNames();
console.log('Tablas:', tables);

const table = await db.openTable('resource_embeddings');
const count = await table.countRows();
console.log('Chunks:', count);

// Ejemplo de búsqueda (necesitas un vector de 1024 dimensiones para mxbai-embed-large)
// const results = await table.search(queryVector).limit(10).execute();
```

### Python

```python
import lancedb

db = lancedb.connect("~/Library/Application Support/Dome/dome-vector")
print(db.table_names())

table = db.open_table("resource_embeddings")
df = table.to_pandas()
print(df.shape, df.columns)
print(df[['id', 'resource_id', 'text']].head())
```

## Esquema de resource_embeddings

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | string | `{resource_id}-{chunk_index}` |
| resource_id | string | ID del recurso en SQLite |
| chunk_index | int | Índice del chunk |
| text | string | Texto del chunk |
| vector | float32[1024] | Embedding (Ollama mxbai-embed-large) |
| metadata | struct | resource_type, title, project_id, created_at |

## Reparar la tabla

Si ves el error "No vector column found to create index":

1. Abre **Ajustes → Indexación**
2. Pulsa **Reparar tabla**
3. Después pulsa **Re-indexar todo** para volver a indexar los recursos

La reparación elimina y recrea `resource_embeddings` con el esquema correcto.
