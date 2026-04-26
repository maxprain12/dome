# Crear un Repositorio de Workflow para Dome

Un workflow en Dome es una automatización que conecta nodos (entradas, agentes, herramientas, salidas) en un grafo visual. Los workflows se publican en el marketplace leyendo un archivo `manifest.json` desde un repositorio de GitHub.

## Estructura del Repositorio

```
mi-workflow-dome/
├── manifest.json      # Obligatorio - Configuración del workflow
├── workflow.json      # Opcional - Definición completa del grafo
├── README.md         # Opcional - Documentación
└── preview.png       # Opcional - Imagen de vista previa
```

## manifest.json

```json
{
  "id": "mi-workflow-nombre",
  "name": "Nombre del Workflow",
  "description": "Descripción breve del workflow",
  "longDescription": "Descripción extendida con casos de uso y detalles.",
  "author": "Tu Nombre",
  "version": "1.0.0",
  "tags": ["research", "writing"],
  "featured": false,
  "downloads": 0,
  "createdAt": 1709251200000,
  "estimatedTime": "~2 min",
  "difficulty": "beginner",
  "inputTypes": ["text"],
  "outputType": "article",
  "category": "research",
  "useCases": [
    "Caso de uso 1",
    "Caso de uso 2"
  ],
  "nodes": [],
  "edges": []
}
```

## Campos Obligatorios

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | string | Identificador único (kebab-case) |
| `name` | string | Nombre visible |
| `description` | string | Descripción breve |
| `author` | string | Nombre del autor |
| `version` | string | Versión semántica |
| `tags` | array | Etiquetas categorización |
| `featured` | boolean | Destacado en marketplace |
| `downloads` | number | Contador descargas |
| `createdAt` | number | Timestamp creación |
| `nodes` | array | Nodos del grafo |
| `edges` | array | Conexiones entre nodos |

## Campos Opcionales

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `longDescription` | string | Descripción extendida |
| `estimatedTime` | string | Tiempo estimado (ej: "~2 min") |
| `difficulty` | string | Dificultad: beginner/intermediate/advanced |
| `inputTypes` | array | Tipos de entrada: text, document, audio, image |
| `outputType` | string | Tipo de salida: article, summary, report |
| `category` | string | Categoría: research, writing, education, data, productivity |
| `useCases` | array | Casos de uso específicos |

## Estructura de Nodes

Los nodos definen los elementos del grafo. Tipos disponibles:

```json
{
  "id": "nodo-unico",
  "type": "textInput|agent|document|output|tool",
  "position": { "x": 100, "y": 200 },
  "data": {
    "type": "text-input|agent|document|output|tool",
    "label": "Etiqueta visible",
    "value": "Valor por defecto (para textInput)",
    "agentId": null,
    "systemAgentRole": "research|writer|library|data|curator|presenter",
    "agentName": "Nombre del agente",
    "agentIconIndex": 0,
    "resourceId": null,
    "resourceTitle": null,
    "status": "idle",
    "outputText": null,
    "errorMessage": null,
    "content": null
  }
}
```

## Tipos de Nodos

### textInput
Entrada de texto del usuario:
```json
{
  "id": "input-topic",
  "type": "textInput",
  "position": { "x": 100, "y": 100 },
  "data": {
    "type": "text-input",
    "label": "Tema a investigar",
    "value": ""
  }
}
```

### document
Documento de la biblioteca:
```json
{
  "id": "doc-source",
  "type": "document",
  "position": { "x": 100, "y": 100 },
  "data": {
    "type": "document",
    "label": "Documento fuente",
    "resourceId": null,
    "resourceTitle": null,
    "resourceContent": null
  }
}
```

### agent
Agente que procesa información:
```json
{
  "id": "agent-researcher",
  "type": "agent",
  "position": { "x": 100, "y": 300 },
  "data": {
    "type": "agent",
    "label": "Investigador",
    "agentId": null,
    "systemAgentRole": "research",
    "agentName": "Research Agent",
    "agentIconIndex": 0,
    "status": "idle",
    "outputText": null,
    "errorMessage": null
  }
}
```

### output
Salida final del workflow:
```json
{
  "id": "output-result",
  "type": "output",
  "position": { "x": 100, "y": 500 },
  "data": {
    "type": "output",
    "label": "Resultado Final",
    "content": null,
    "status": "idle"
  }
}
```

## Sistema de Roles de Agentes

Los agentes en workflows usan `systemAgentRole` predefinidos:

- `research` - Agente investigador (búsqueda web, análisis)
- `writer` - Agente escritor (redacción, edición)
- `library` - Agente de biblioteca (búsqueda en recursos)
- `data` - Agente de datos (análisis de Excel/datos)
- `curator` - Agente curador (gestión de conocimiento)
- `presenter` - Agente presentador (presentaciones, mapas mentales)

## Estructura de Edges

Las aristas conectan nodos:

```json
{
  "id": "edge-1",
  "source": "nodo-origen",
  "target": "nodo-destino"
}
```

## Ejemplo Completo: Research & Write

```json
{
  "id": "research-write-workflow",
  "name": "Research & Write",
  "description": "Investiga un tema y redacta un artículo completo.",
  "longDescription": "Este workflow conecta un agente investigador con un agente escritor. Primero busca información relevante en la web y luego produce un artículo estructurado con citas.",
  "author": "Tu Nombre",
  "version": "1.0.0",
  "tags": ["research", "writing", "productivity"],
  "featured": true,
  "downloads": 0,
  "createdAt": 1709251200000,
  "estimatedTime": "~2 min",
  "difficulty": "beginner",
  "inputTypes": ["text"],
  "outputType": "article",
  "category": "research",
  "useCases": [
    "Redactar artículos académicos",
    "Crear posts de blog documentados",
    "Preparar informes de investigación"
  ],
  "nodes": [
    {
      "id": "rw-input",
      "type": "textInput",
      "position": { "x": 80, "y": 160 },
      "data": {
        "type": "text-input",
        "label": "Tema a investigar",
        "value": ""
      }
    },
    {
      "id": "rw-researcher",
      "type": "agent",
      "position": { "x": 80, "y": 320 },
      "data": {
        "type": "agent",
        "label": "Investigador",
        "agentId": null,
        "systemAgentRole": "research",
        "agentName": "Research Agent",
        "agentIconIndex": 0,
        "status": "idle",
        "outputText": null,
        "errorMessage": null
      }
    },
    {
      "id": "rw-writer",
      "type": "agent",
      "position": { "x": 80, "y": 490 },
      "data": {
        "type": "agent",
        "label": "Escritor",
        "agentId": null,
        "systemAgentRole": "writer",
        "agentName": "Writer Agent",
        "agentIconIndex": 0,
        "status": "idle",
        "outputText": null,
        "errorMessage": null
      }
    },
    {
      "id": "rw-output",
      "type": "output",
      "position": { "x": 80, "y": 660 },
      "data": {
        "type": "output",
        "label": "Artículo Final",
        "content": null,
        "status": "idle"
      }
    }
  ],
  "edges": [
    { "id": "rw-e1", "source": "rw-input", "target": "rw-researcher" },
    { "id": "rw-e2", "source": "rw-researcher", "target": "rw-writer" },
    { "id": "rw-e3", "source": "rw-writer", "target": "rw-output" }
  ]
}
```

## Publicar en el Marketplace

1. Crea un repositorio público en GitHub
2. Añade el archivo `manifest.json` en la raíz con los nodos y aristas
3. Añade tu repositorio al archivo `workflows.json` en el proyecto Dome o en la configuración del marketplace

## Dificultades Recomendadas

- **beginner**: 2-3 nodos, flujo lineal
- **intermediate**: 4-5 nodos, bifurcciones simples
- **advanced**: 6+ nodos, múltiples ramas paralelas

## Repo de Ejemplo

Ver repositorio de ejemplo: [dome-workflow-example](https://github.com/tu-usuario/dome-workflow-example)
