# Agent Canvas

Documentación del constructor visual de workflows de IA de Dome (introducido en v2.0.8).

---

## ¿Qué es el Agent Canvas?

El **Agent Canvas** es una interfaz visual tipo "no-code" para construir workflows de IA complejos. Usa **D3** (zoom, arrastre, aristas SVG) como motor de canvas: los usuarios arrastran nodos, los conectan y configuran cada paso del workflow.

Cuando ejecutas un workflow, el Run Engine procesa los nodos en orden, los resultados fluyen de nodo a nodo, y puedes ver los logs en tiempo real.

---

## Tipos de nodos

| Nodo | Ícono | Descripción |
|------|-------|-------------|
| **Text Input** | 📝 | Punto de entrada: texto fijo o parametrizable |
| **Agent** | 🤖 | Ejecuta un agente IA con instrucciones y herramientas |
| **Document** | 📄 | Lee o escribe un recurso de tu biblioteca Dome |
| **Output** | 🎯 | Captura y muestra el resultado final del workflow |
| **Image** | 🖼️ | Procesa o analiza imágenes |

### Text Input node

```json
{
  "type": "text_input",
  "config": {
    "label": "Tema a investigar",
    "defaultValue": "",
    "placeholder": "Escribe el tema aquí..."
  }
}
```

### Agent node

```json
{
  "type": "agent",
  "config": {
    "agentId": "research",       // ID de agente sistema o personalizado
    "systemPrompt": "...",       // instrucciones adicionales
    "model": "gpt-4o",
    "toolIds": ["web_search", "web_fetch"],
    "maxIterations": 10
  }
}
```

### Document node

```json
{
  "type": "document",
  "config": {
    "mode": "read",              // "read" | "write" | "append"
    "resourceId": "...",         // ID del recurso (puede ser dinámico con {input})
    "projectId": "..."
  }
}
```

---

## Conexiones (Edges)

Las conexiones definen el **flujo de datos** entre nodos. El output de un nodo se convierte en el input del siguiente.

- Un nodo puede tener múltiples conexiones de entrada (se concatenan)
- Un nodo puede conectar a múltiples nodos de salida (el mismo output fluye a todos)
- No se permiten ciclos (el grafo es un DAG)

---

## Crear un workflow

### Desde cero

1. Abre **Agent Canvas** desde la barra lateral o Marketplace → Workflows
2. Haz clic en **Nuevo workflow**
3. Arrastra nodos desde el panel lateral al canvas
4. Conecta los nodos arrastrando desde el punto de salida (derecha) al punto de entrada (izquierda)
5. Haz clic en cada nodo para configurarlo
6. Haz clic en **Guardar** (Cmd+S)

### Desde el Marketplace

1. Ve a Marketplace → Workflows
2. Haz clic en **Instalar** en el workflow que quieras
3. Aparecerá en tu lista de workflows
4. Abre y configura los parámetros si es necesario

---

## Ejecutar un workflow

1. Abre el workflow
2. Rellena los **Text Input** nodes si tienen campos configurables
3. Haz clic en **▶ Ejecutar**
4. El panel inferior mostrará los logs en tiempo real
5. El nodo **Output** mostrará el resultado final

### Panel de ejecución

Durante la ejecución, el panel inferior muestra:
- Qué nodo está procesando actualmente (highlight en el canvas)
- Logs de cada paso con timestamps
- Streaming del output del agente en tiempo real
- Estado final: ✅ Completado / ❌ Error

---

## Guardar y compartir workflows

Los workflows se guardan como archivos JSON en:
```
public/workflows/<workflow-id>.json
```

Formato del JSON:

```json
{
  "id": "my-workflow",
  "name": "Research & Write",
  "description": "Investiga un tema y escribe un artículo",
  "version": "1.0.0",
  "nodes": [...],
  "edges": [...],
  "createdAt": "2026-03-18T10:00:00Z"
}
```

Para publicar en el Marketplace, sigue la guía [workflow-repo.md](./marketplace/workflow-repo.md).

---

## IPC Channels

| Canal | Descripción |
|-------|-------------|
| `runs:startWorkflow` | Inicia ejecución de un workflow |
| `runs:cancel` | Cancela ejecución |
| `runs:list` | Lista ejecuciones con filtro por workflowId |
| `runs:updated` (push) | Actualización de estado en tiempo real |
| `runs:step` (push) | Paso completado |
| `runs:chunk` (push) | Texto streaming del agente |

Los workflows usan el mismo [Run Engine](./runs.md) que las automatizaciones.

---

## Arquitectura técnica

```
Renderer (D3 canvas)
       │
       │ Dibuja nodos/edges, captura config
       │
       │ runs:startWorkflow({ workflowDef, inputs })
       ▼
  electron/ipc/runs.cjs
       │
       ▼
  run-engine.cjs → startWorkflowRun()
       │
       ├── Parsea el grafo (topological sort)
       │
       └── Para cada nodo, en orden:
           ├── text_input: inyecta el texto del usuario
           ├── agent: startLangGraphRun() → LangGraph
           ├── document: lee/escribe recurso via DB
           └── output: captura y emite resultado final
```

---

## Componentes UI

| Componente | Ubicación | Descripción |
|-----------|-----------|-------------|
| `AgentCanvasPage` | `app/pages/` | Página principal del canvas |
| `CanvasWorkspace` | `app/components/agent-canvas/` | Lienzo D3 principal |
| `NodePalette` | `app/components/agent-canvas/` | Panel lateral de nodos disponibles |
| `NodeConfigPanel` | `app/components/agent-canvas/` | Panel de configuración de nodo seleccionado |
| `ExecutionLogPanel` | `app/components/agent-canvas/` | Logs en tiempo real |
| `WorkflowLibrary` | `app/components/agent-canvas/` | Lista de workflows guardados |

---

## Workflows predefinidos (Marketplace)

Dome incluye workflows predefinidos listos para usar:

| Workflow | Descripción |
|----------|-------------|
| **Research & Write** | Investiga un tema en internet y genera un artículo estructurado |
| **Document Summarizer** | Resume uno o varios documentos de tu biblioteca |
| **Knowledge Curator** | Analiza tu biblioteca y sugiere conexiones entre recursos |
| **Quiz Generator** | Lee un recurso y genera preguntas de práctica |

---

*Ver también: [agent-teams.md](./agent-teams.md) para colaboración multi-agente en chat, [runs.md](./runs.md) para el Run Engine.*
