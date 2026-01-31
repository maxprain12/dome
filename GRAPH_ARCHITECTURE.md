# Arquitectura del Knowledge Graph (Grafo de Conocimiento) en Dome

## 1. Introducción y Justificación

### ¿Por qué un Knowledge Graph?
Actualmente, Dome utiliza **búsqueda vectorial (embeddings)** para encontrar similitudes semánticas. Esto es excelente para responder preguntas difusas como "¿Qué notas hablan sobre programación?", pero tiene limitaciones:
1.  **Cajas Negras:** No sabemos *por qué* dos notas son similares.
2.  **Falta de Relaciones Explícitas:** Los vectores no capturan la naturaleza de la relación (ej: "A *causa* B", "A *es padre de* B").
3.  **Alucinaciones:** Los LLMs pueden inventar relaciones si no están explícitamente definidas.

Un **Knowledge Graph (KG)** complementa esto añadiendo una capa de datos estructurados deterministas.
*   **Vectores:** Similitud implícita / "Feeling".
*   **Grafo:** Relaciones explícitas / "Facts".

### Enfoque Técnico: SQLite como Motor de Grafos
En lugar de introducir una base de datos pesada como Neo4j (que requiere Java/recursos altos), utilizamos **SQLite**.
Dado que Dome es una aplicación local ("Local First"), SQLite es ideal por:
*   **Portabilidad:** Un solo archivo `.db`.
*   **Rendimiento:** Las consultas recursivas (Common Table Expressions - CTEs) de SQL permiten recorrer grafos eficientemente para profundidades bajas/medias.
*   **Integración:** Ya usamos SQLite para los metadatos.

## 2. Esquema de Datos

Para mantener la integridad y flexibilidad, implementamos un esquema donde "Todo es un Nodo", pero mantenemos vinculación fuerte con los recursos (archivos) existentes.

### Tabla: `graph_nodes`
Representa cualquier entidad en el grafo. Puede ser un archivo (Nota, PDF) o un concepto abstracto (Autor, Tema, Tecnología).

| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | TEXT (PK) | UUID único del nodo. |
| `resource_id` | TEXT (FK) | (Opcional) Referencia a la tabla `resources` si este nodo representa un archivo. |
| `label` | TEXT | Nombre legible del nodo (ej: "Introducción a React", "Elon Musk"). |
| `type` | TEXT | Tipo de nodo: `resource`, `concept`, `person`, `location`, `event`. |
| `properties` | JSON | Metadatos flexibles (ej: `{"born": 1971}`). |
| `created_at` | INTEGER | Timestamp. |

*   **Sincronización:** Cuando se crea una nota en `resources`, un trigger o servicio debe crear su correspondiente entrada en `graph_nodes`.

### Tabla: `graph_edges`
Representa las relaciones dirigidas entre nodos.

| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | TEXT (PK) | UUID de la relación. |
| `source_id` | TEXT (FK) | Origen de la relación (`graph_nodes.id`). |
| `target_id` | TEXT (FK) | Destino de la relación (`graph_nodes.id`). |
| `relation` | TEXT | Tipo de relación (ej: `MENTIONS`, `AUTHORED_BY`, `RELATED_TO`). |
| `weight` | REAL | Peso de la relación (0.0 - 1.0) para algoritmos de ranking. |
| `metadata` | JSON | Datos extra (ej: contexto de la mención). |
| `created_at` | INTEGER | Timestamp. |

## 3. Flujo de Datos

1.  **Ingesta Manual:** El usuario crea enlaces explícitos (Wiki-links).
2.  **Extracción LLM:**
    *   Un servicio background (`llm-graph-extractor`) procesa el contenido de las notas.
    *   Usa un modelo local (Ollama) para extraer entidades y relaciones.
    *   Ejemplo: "Martin (Node:Person) escribió (Edge:AUTHORED) esta nota (Node:Resource)".
3.  **Consulta:**
    *   "Trae vecinos": SQL `JOIN` simple.
    *   "Camino más corto": SQL Recursive CTE.

## 4. Estrategia de Implementación
*   Se mantienen las tablas existentes de `resources` para compatibilidad.
*   Se añaden `graph_nodes` y `graph_edges`.
*   Se migran los datos de `resource_links` (tabla existente) a `graph_edges` eventualmente, o se mantienen sincronizados. *Nota: En este prototipo, `graph_edges` será la nueva fuente de verdad para el grafo semántico, mientras `resource_links` puede quedar para enlaces simples de UI.*
