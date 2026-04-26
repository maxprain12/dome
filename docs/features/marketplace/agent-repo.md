# Crear un Repositorio de Agente para Dome

Un agente en Dome es una configuración de IA con instrucciones personalizadas y herramientas asignadas. Los agentes se publican en el marketplace leyendo un archivo `manifest.json` desde un repositorio de GitHub.

## Estructura del Repositorio

```
mi-agente-dome/
├── manifest.json      # Obligatorio - Configuración del agente
├── README.md         # Opcional - Documentación
└── icon.svg          # Opcional - Icono personalizado
```

## manifest.json

El archivo `manifest.json` define completamente tu agente:

```json
{
  "id": "mi-agente-nombre",
  "name": "Nombre del Agente",
  "description": "Descripción breve del agente (se muestra en tarjetas)",
  "longDescription": "Descripción extendida que aparece en el detalle del agente. Puedes usar múltiples párrafos para explicar las capacidades, casos de uso y особенidades.",
  "systemInstructions": "Eres un [rol específico]. Cuando el usuario te pida [tarea]: (1) [primer paso], (2) [segundo paso], (3) [tercer paso]. Siempre [regla importante]. Responde siempre en el idioma del usuario.",
  "toolIds": [
    "web_search",
    "web_fetch",
    "resource_search",
    "resource_get",
    "resource_create"
  ],
  "mcpServerIds": [],
  "skillIds": [],
  "iconIndex": 1,
  "author": "Tu Nombre",
  "version": "1.0.0",
  "tags": ["etiqueta1", "etiqueta2"],
  "featured": false,
  "downloads": 0,
  "createdAt": 1709251200000
}
```

## Campos Obligatorios

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | string | Identificador único (kebab-case) |
| `name` | string | Nombre visible del agente |
| `description` | string | Descripción breve (máx 200 chars recomendados) |
| `systemInstructions` | string | Instrucciones del sistema para el modelo de IA |
| `toolIds` | array | Lista de IDs de herramientas disponibles |
| `author` | string | Nombre del autor |
| `version` | string | Versión semántica (1.0.0) |
| `tags` | array | Etiquetas para categorizar |
| `featured` | boolean | Mostrar como destacado |
| `downloads` | number | Contador de descargas |
| `createdAt` | number | Timestamp de creación |

## Campos Opcionales

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `longDescription` | string | Descripción extendida |
| `mcpServerIds` | array | IDs de servidores MCP necesarios |
| `skillIds` | array | IDs de skills requeridos |
| `iconIndex` | number | Índice del icono (0-20) |

## Herramientas Disponibles

Las herramientas disponibles en Dome incluyen:

- `web_search` - Búsqueda en la web
- `web_fetch` - Obtener contenido de URLs
- `deep_research` - Investigación profunda multi-fuente
- `resource_search` - Buscar en la biblioteca
- `resource_semantic_search` - Búsqueda semántica
- `resource_get` - Obtener contenido de un recurso
- `resource_create` - Crear nuevo recurso
- `resource_update` - Actualizar recurso
- `resource_list` - Listar recursos
- `flashcard_create` - Crear flashcards
- `generate_quiz` - Generar quiz
- `generate_mindmap` - Generar mapa mental
- `ppt_create` - Crear presentación
- `ppt_export` - Exportar presentación
- `excel_get` - Leer Excel
- `excel_create` - Crear Excel
- `calendar_create_event` - Crear evento
- `generate_audio_script` - Generar guion de audio
- `generate_knowledge_graph` - Generar grafo de conocimiento

## Iconos

El campo `iconIndex` selecciona un icono de la librería de iconos interna:

- 0: Robot
- 1: Buscar/Lupa
- 2: Libro
- 3: Código
- 4: Gráfico
- 5: Estrella
- 6: Engranaje
- 7: Martillo
- 8: Herramienta
- 9: Cohete
- 10: Corazón
- 11: Luz
- 12: Mundo
- 13-20: Otros iconos

## Ejemplo Completo

```json
{
  "id": "investigador-academico",
  "name": "Investigador Académico",
  "description": "Especialista en investigación académica con búsqueda web y análisis de fuentes.",
  "longDescription": "Este agente está diseñado para realizar investigaciones académicas rigurosas. Combina búsqueda web profunda con análisis de fuentes bibliográficas para producir trabajos bien documentados. Ideal para estudiantes, investigadores y profesionales que necesitan información verificada.",
  "systemInstructions": "Eres un investigador académico experto. Cuando el usuario te pida investigar un tema: (1) usa web_search para encontrar fuentes académicas relevantes, (2) usa web_fetch para leer el contenido completo de las fuentes más prometedoras, (3) sintetiza la información encontrada con citas apropiadas, (4) presenta los resultados con estructura académica: resumen, hallazgos, conclusiones y bibliografía. Usa siempre formato APA para las citas. Responde en el idioma del usuario.",
  "toolIds": [
    "web_search",
    "web_fetch",
    "deep_research",
    "resource_search",
    "resource_semantic_search"
  ],
  "mcpServerIds": [],
  "skillIds": [],
  "iconIndex": 1,
  "author": "Tu Nombre",
  "version": "1.0.0",
  "tags": ["research", "academic", "education"],
  "featured": true,
  "downloads": 0,
  "createdAt": 1709251200000
}
```

## Publicar en el Marketplace

1. Crea un repositorio público en GitHub
2. Añade el archivo `manifest.json` en la raíz
3. Añade tu repositorio al archivo `agents.json` en el proyecto Dome o en la configuración del marketplace

## Repo de Ejemplo

Ver repositorio de ejemplo: [dome-agent-example](https://github.com/tu-usuario/dome-agent-example)
