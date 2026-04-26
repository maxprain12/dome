# Crear un Repositorio de Servidor MCP para Dome

Los servidores MCP (Model Context Protocol) permiten a los agentes conectar con herramientas y servicios externos. Se publican en el marketplace leyendo la configuración desde repositorios de GitHub.

## ¿Qué es MCP?

MCP (Model Context Protocol) es un protocolo que permite a los agentes de IA acceder a herramientas externas de manera estandarizada. Puedes crear servidores MCP que expongan APIs, bases de datos, herramientas de desarrollo, y más.

## Estructura del Repositorio

```
mi-mcp-servidor/
├── manifest.json      # Obligatorio - Configuración del servidor MCP
├── README.md         # Opcional - Documentación
├── schema.sql        # Opcional - Schema de base de datos
└── config/          # Opcional - Archivos de configuración
```

## manifest.json

```json
{
  "id": "mi-mcp-servidor",
  "name": "Nombre del Servidor MCP",
  "description": "Descripción breve de lo que hace el servidor",
  "command": "npx",
  "args": ["-y", "@tu-usuario/mi-mcp-servidor"],
  "env": {
    "API_KEY": "${MCP_API_KEY}"
  },
  "author": "Tu Nombre",
  "version": "1.0.0",
  "tags": ["development", "api"],
  "repository": "https://github.com/tu-usuario/mi-mcp-servidor"
}
```

## Campos Obligatorios

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | string | Identificador único |
| `name` | string | Nombre visible |
| `description` | string | Descripción breve |
| `command` | string | Comando para ejecutar (npx, node, python, etc.) |
| `args` | array | Argumentos del comando |

## Campos Opcionales

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `env` | object | Variables de entorno requeridas |
| `author` | string | Nombre del autor |
| `version` | string | Versión semántica |
| `tags` | array | Etiquetas de categorización |
| `repository` | string | URL del repositorio |

## Tipos de Servidores MCP

### 1. Servidor NPM/Paquete

```json
{
  "id": "filesystem-mcp",
  "name": "Filesystem MCP",
  "description": "Acceso al sistema de archivos local",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/ruta/a/directorio"],
  "author": "Anthropic",
  "version": "1.0.0",
  "tags": ["filesystem", "storage"],
  "repository": "https://github.com/anthropics/mcp-servers"
}
```

### 2. Servidor Python

```json
{
  "id": "python-api-mcp",
  "name": "Python API MCP",
  "description": "Conecta con APIs de Python",
  "command": "python",
  "args": ["-m", "mi_paquete_mcp"],
  "env": {
    "API_URL": "https://api.ejemplo.com"
  },
  "author": "Tu Nombre",
  "version": "1.0.0",
  "tags": ["python", "api"],
  "repository": "https://github.com/tu-usuario/mi-mcp-python"
}
```

### 3. Servidor con API Key

```json
{
  "id": "github-mcp",
  "name": "GitHub MCP",
  "description": "Integración con GitHub API",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
  },
  "author": "Anthropic",
  "version": "1.0.0",
  "tags": ["github", "git", "development"],
  "repository": "https://github.com/anthropics/mcp-servers"
}
```

## Ejemplo Completo: Servidor de Base de Datos

```json
{
  "id": "database-mcp",
  "name": "Database Query MCP",
  "description": "Ejecuta consultas SQL en tu base de datos PostgreSQL",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://usuario:password@localhost:5432/mibase"],
  "author": "Tu Nombre",
  "version": "1.0.0",
  "tags": ["database", "postgres", "sql", "data"],
  "repository": "https://github.com/tu-usuario/database-mcp"
}
```

## Ejemplo Completo: Servidor de Búsqueda

```json
{
  "id": "search-mcp",
  "name": "Search API MCP",
  "description": "Integración con APIs de búsqueda como Tavily, Brave Search, etc.",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-tavily"],
  "env": {
    "TAVILY_API_KEY": "${TAVILY_API_KEY}"
  },
  "author": "Tu Nombre",
  "version": "1.0.0",
  "tags": ["search", "web", "research"],
  "repository": "https://github.com/tu-usuario/search-mcp",
  "version": "1.0.0"
}
```

## Variables de Entorno

Dome gestiona las variables de entorno de forma segura:

### Configuración en manifest.json
```json
{
  "env": {
    "MI_API_KEY": "${MI_API_KEY}",
    "DATABASE_URL": "${DATABASE_URL}"
  }
}
```

### Definición en la UI
Cuando el usuario instala el servidor MCP, se le pedirán los valores para cada variable de entorno. Los valores se almacenan de forma segura y se injectan automáticamente.

## Añadir al Marketplace

Para añadir tu servidor MCP al marketplace, necesitas:

1. **Publicar tu paquete** (npm, pip, etc.)
2. **Añadir la configuración** a `mcp.json` o en las fuentes del marketplace

```json
[
  {
    "id": "mi-mcp-servidor",
    "name": "Mi Servidor MCP",
    "author": "tu-usuario",
    "description": "Descripción del servidor",
    "command": "npx",
    "args": ["-y", "@tu-usuario/mi-paquete"],
    "repository": "https://github.com/tu-usuario/mi-mcp"
  }
]
```

## Servidores MCP Populares

Algunos servidores MCP disponibles:

- `@modelcontextprotocol/server-filesystem` - Acceso a archivos
- `@modelcontextprotocol/server-github` - GitHub API
- `@modelcontextprotocol/server-postgres` - PostgreSQL
- `@modelcontextprotocol/server-brave-search` - Brave Search
- `@modelcontextprotocol/server-memory` - Memoria persistente
- `@modelcontextprotocol/server-slack` - Slack
- `@modelcontextprotocol/server-sentry` - Sentry

## Mejores Prácticas

1. **Documenta las herramientas**: Explica qué herramientas expone tu servidor
2. **Usa variables de entorno**: No hardcodees credenciales
3. **Versiona tu código**: Usa semver para el servidor
4. **Proporciona ejemplos**: Muestra cómo usar cada herramienta
5. **Mantenlo simple**: Un servidor MCP debe hacer pocas cosas bien

## Repo de Ejemplo

Ver repositorio de ejemplo: [dome-mcp-example](https://github.com/tu-usuario/dome-mcp-example)

## Más Información

- **Documentación MCP**: https://modelcontextprotocol.io/
- **Servidores disponibles**: https://github.com/anthropics/mcp-servers
