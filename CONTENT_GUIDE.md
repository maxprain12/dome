# Guía de Contenido del Marketplace

Dome incluye un marketplace de agentes, workflows, skills, servidores MCP y plugins.
Todo el contenido estático vive en `public/` y `electron/skills/bundled/`.
Esta guía explica cómo añadir o editar cada tipo de ítem.

---

## 1. Agentes (`public/agents/`)

Cada agente vive en su propia subcarpeta con un `manifest.json`.

### Estructura de archivos

```
public/
├── agents.json                       ← índice (lista resumida)
└── agents/
    └── mi-agente/
        └── manifest.json            ← manifiesto completo
```

### Paso 1 — Crear la carpeta y el manifiesto

```
mkdir public/agents/mi-agente
```

```json
// public/agents/mi-agente/manifest.json
{
  "id": "mi-agente",
  "name": "Mi Agente",
  "description": "Una línea que describe qué hace este agente.",
  "longDescription": "Descripción extensa para el panel de detalle. Explica cómo trabaja, qué herramientas usa y casos de uso concretos.",
  "systemInstructions": "Eres un experto en... Cuando el usuario pida X: (1) haz A, (2) haz B, (3) presenta resultados con formato Y. Responde siempre en el idioma del usuario.",
  "toolIds": [
    "web_search",
    "web_fetch",
    "resource_semantic_search"
  ],
  "mcpServerIds": [],
  "iconIndex": 1,
  "author": "Dome Team",
  "version": "1.0.0",
  "tags": ["research", "productivity"],
  "featured": false,
  "downloads": 0,
  "createdAt": 1700000000000
}
```

**Campos clave:**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | string | Igual que el nombre de la carpeta. Solo letras, números y guiones. |
| `name` | string | Nombre visible (≤ 30 car). |
| `description` | string | Una línea para la tarjeta del marketplace (≤ 120 car). |
| `longDescription` | string | Párrafo(s) para la vista de detalle. |
| `systemInstructions` | string | Prompt de sistema completo. Lo ve el modelo en cada chat. Usa pasos numerados. |
| `toolIds` | string[] | IDs de herramientas disponibles. Ver lista en `/app/lib/agents/tool-inventory.ts`. |
| `mcpServerIds` | string[] | IDs de servidores MCP (vacío si no aplica). |
| `iconIndex` | number | 1–18. Índice del sprite del agente. |
| `featured` | boolean | `true` → aparece en la sección destacada del marketplace. |
| `tags` | string[] | Categorías: `research`, `writing`, `productivity`, `data`, `education`, `language`, `coding`, `content`. |
| `version` | string | Semver. Incrementar al actualizar `systemInstructions` o `toolIds`. |

### Paso 2 — Actualizar el índice

Añade una entrada al final de `public/agents.json`:

```json
{
  "id": "mi-agente",
  "name": "Mi Agente",
  "description": "Una línea corta.",
  "author": "Dome Team",
  "version": "1.0.0",
  "tags": ["research"],
  "featured": false,
  "iconIndex": 1
}
```

---

## 2. Workflows (`public/workflows/`)

Los workflows son grafos de nodos que se instalan en el canvas de agentes.

### Estructura

```
public/
├── workflows.json                    ← índice
└── workflows/
    └── mi-workflow/
        └── manifest.json
```

### Manifiesto

```json
// public/workflows/mi-workflow/manifest.json
{
  "id": "mi-workflow",
  "name": "Mi Workflow",
  "description": "Una línea de descripción.",
  "author": "Dome Team",
  "version": "1.0.0",
  "tags": ["research", "writing"],
  "featured": false,
  "estimatedTime": "~5 min",
  "difficulty": "beginner",
  "category": "research",
  "useCases": [
    "Caso de uso 1",
    "Caso de uso 2"
  ],
  "nodes": [
    {
      "id": "input-1",
      "type": "text-input",
      "label": "Tema de investigación",
      "position": { "x": 100, "y": 100 },
      "data": { "placeholder": "Ej: cambio climático" }
    },
    {
      "id": "agent-1",
      "type": "agent",
      "label": "Investigador",
      "position": { "x": 400, "y": 100 },
      "data": {
        "agentId": "dome-research-pro",
        "instructions": "Investiga el tema: {{input-1}}"
      }
    },
    {
      "id": "output-1",
      "type": "output",
      "label": "Resultado",
      "position": { "x": 700, "y": 100 },
      "data": {}
    }
  ],
  "edges": [
    { "id": "e1", "source": "input-1", "target": "agent-1" },
    { "id": "e2", "source": "agent-1", "target": "output-1" }
  ]
}
```

**Tipos de nodo:**

| `type` | Descripción |
|--------|-------------|
| `text-input` | Entrada de texto del usuario al iniciar el run |
| `agent` | Nodo que invoca un agente. Referencia `agentId` + `instructions`. |
| `transform` | Transforma el texto de salida del nodo anterior. |
| `output` | Nodo terminal que captura el resultado final del workflow. |

### Índice `public/workflows.json`

```json
{
  "id": "mi-workflow",
  "name": "Mi Workflow",
  "description": "Una línea corta.",
  "author": "Dome Team",
  "version": "1.0.0",
  "tags": ["research"],
  "featured": false,
  "estimatedTime": "~5 min",
  "difficulty": "beginner",
  "category": "research",
  "useCases": ["Caso 1"]
}
```

---

## 3. Skills (`electron/skills/bundled/`)

Las skills son archivos `SKILL.md` que se inyectan automáticamente en el sistema de todos los agentes.
Al arrancar la app por primera vez se copian a `~/.dome/skills/`.

### Estructura

```
electron/skills/bundled/
└── mi-skill/
    └── SKILL.md
```

### Formato SKILL.md

```markdown
---
name: mi-skill
description: "Una línea que describe qué hace esta skill."
when_to_use: "En qué situaciones el modelo debe activar esta skill."
version: "1.0.0"
author: "Dome Team"
tags: ["productivity", "writing"]
category: "productivity"
---

## Instrucciones

Cuando el usuario pida X:
1. Haz A usando la herramienta `nombre_herramienta`.
2. Verifica el resultado con Y.
3. Presenta la respuesta en formato Z.

### Reglas
- Siempre usa APA 7 para citas.
- No omitas pasos aunque el usuario parezca avanzado.
```

**Campos del frontmatter:**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `name` | string | Debe ser igual al nombre de la carpeta. Solo letras, números y guiones. |
| `description` | string | Una línea para el marketplace y el system prompt. |
| `when_to_use` | string | Ayuda al modelo a saber cuándo invocar la skill. |
| `version` | string | Semver. |
| `allowed-tools` | list | (Opcional) Herramientas específicas de esta skill. |

### Registrar en el catálogo del marketplace

Añade una entrada a `public/skills.json`:

```json
{
  "id": "mi-skill",
  "name": "Mi Skill",
  "description": "Una línea de descripción.",
  "author": "Dome Team",
  "version": "1.0.0",
  "tags": ["productivity", "writing"],
  "category": "productivity"
}
```

El id debe coincidir con el nombre de la carpeta y con el campo `name:` del SKILL.md.

---

## 4. Servidores MCP (`public/mcp/`)

```
public/
├── mcp.json                         ← índice
└── mcp/
    └── mi-servidor/
        └── manifest.json
```

### Manifiesto MCP

```json
{
  "id": "mi-servidor",
  "name": "Mi Servidor MCP",
  "description": "Descripción de las herramientas que expone este servidor.",
  "author": "Dome Team",
  "version": "1.0.0",
  "tags": ["productivity"],
  "command": "npx",
  "args": ["-y", "@mi-paquete/mcp-server"],
  "env": {
    "API_KEY": ""
  }
}
```

**Nota:** El usuario tendrá que rellenar las variables de entorno en Settings → MCP después de instalar.

---

## 5. Plugins

Los plugins son extensiones nativas (`.so`/`.dylib`/`.dll`) instaladas vía el instalador del marketplace.
No tienen un directorio estático en `public/` — se distribuyen por separado.

Para añadir un plugin al catálogo, actualiza `electron/marketplace-config.cjs`.

---

## Checklist antes de commit

- [ ] El `id` coincide con el nombre de la carpeta y con el índice.
- [ ] El `version` está en semver (`X.Y.Z`).
- [ ] La `description` tiene ≤ 120 caracteres y no termina en punto.
- [ ] El campo `tags` usa solo tags existentes (ver lista arriba).
- [ ] El `iconIndex` está entre 1 y 18 (agentes).
- [ ] Las `systemInstructions` mencionan "responde en el idioma del usuario".
- [ ] El índice (`agents.json`, `workflows.json`, `skills.json`) está actualizado.
- [ ] La app arranca y el nuevo ítem aparece en el marketplace.
