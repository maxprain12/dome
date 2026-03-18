# Agent Teams

Documentación del sistema de equipos multi-agente de Dome (introducido en v2.0.8).

---

## ¿Qué son los Agent Teams?

Los **Agent Teams** permiten crear equipos de agentes especializados que colaboran en tareas complejas. Un **supervisor** (LLM) recibe la tarea del usuario, la delega a los agentes apropiados del equipo, y sintetiza los resultados en una respuesta final.

```
Usuario
   │
   │ "Investiga X y luego escribe un artículo"
   ▼
┌──────────────┐
│  Supervisor  │  ← decide qué agente llama
│    (LLM)     │
└──────┬───────┘
       │
  ┌────┼────────────────┐
  │    │                │
  ▼    ▼                ▼
Research  Library    Writer
 Agent    Agent       Agent
  │         │           │
  └────┬────┘           │
       │ síntesis        │
       └────────────────►│
                         │
                  respuesta final
                         │
                         ▼
                      Usuario
```

---

## Agentes del sistema

Dome incluye 6 agentes especializados preconfigurados:

### Research Agent
- **Herramientas**: `web_search`, `web_fetch`, `deep_research`
- **Especialidad**: Búsqueda en internet, verificación con múltiples fuentes, síntesis de información actualizada
- **Cuándo el supervisor lo usa**: preguntas sobre hechos recientes, investigación de temas, noticias

### Library Agent
- **Herramientas**: `resource_search`, `resource_get`, `resource_get_section`, `resource_list`, `resource_semantic_search`
- **Especialidad**: Búsqueda y análisis de documentos en la biblioteca personal de Dome
- **Cuándo el supervisor lo usa**: preguntas sobre documentos propios, conexiones entre recursos

### Writer Agent
- **Herramientas**: `resource_create`, `resource_update`
- **Especialidad**: Redacción, estructuración de contenido, creación de notas
- **Cuándo el supervisor lo usa**: cuando hay que producir texto, artículos, resúmenes escritos

### Data Agent
- **Herramientas**: `excel_get`, `excel_set_cell`, `excel_set_range`, `excel_add_row`, `resource_get`, `resource_list`
- **Especialidad**: Análisis de datos numéricos, tablas, identificación de tendencias
- **Cuándo el supervisor lo usa**: análisis de spreadsheets, datos estructurados

### Presenter Agent
- **Herramientas**: `ppt_create`, `ppt_get_slides`, `resource_create`
- **Especialidad**: Transformar información en presentaciones estructuradas
- **Cuándo el supervisor lo usa**: cuando hay que crear slides o materiales visuales

### Curator Agent
- **Herramientas**: `get_related_resources`, `resource_semantic_search`, `resource_list`, `flashcard_create`, `resource_create`
- **Especialidad**: Organización del conocimiento, conexiones entre materiales, generación de flashcards
- **Cuándo el supervisor lo usa**: revisión y organización de la biblioteca

---

## Agentes personalizados en Teams

Puedes añadir tus propios agentes personalizados a los equipos. Un agente personalizado en el equipo funciona igual que los del sistema, con las herramientas e instrucciones que hayas configurado.

---

## Cómo funciona el supervisor

El supervisor es un LLM con prompt especial que:

1. **Analiza la tarea** y decide si la puede resolver solo o necesita delegación
2. **Llama a un agente** con una sub-tarea específica (función `callSubAgent`)
3. **Espera el resultado** del agente
4. **Itera** si necesita más información (Research → Library → Writer, etc.)
5. **Sintetiza** los resultados en una respuesta final coherente

El supervisor tiene acceso al **contexto de Dome** (ruta actual, recurso abierto, carpeta) para decisiones más relevantes:

```javascript
// electron/ipc/agent-team.cjs
function buildDelegationContext(payload) {
  // Incluye: route, resourceId, resourceTitle, folderId, etc.
  // El supervisor usa esto para decidir qué agente y con qué contexto
}
```

---

## UI del Agent Teams chat

El chat de Agent Teams es similar al de Many pero con indicadores de qué agente está respondiendo:

- **Indicador de agente activo**: muestra qué agente del equipo está respondiendo
- **Pasos del supervisor**: logs del proceso de delegación (colapsables)
- **Respuesta final**: la síntesis del supervisor
- **Selector de equipo**: en la cabecera del chat

---

## IPC Channels

| Canal | Descripción |
|-------|-------------|
| `agent-team:chat` | Enviar mensaje al equipo (streaming) |
| `agent-team:abort` | Cancelar respuesta en curso |
| `agent-team:getSessions` | Lista de sesiones de chat del equipo |
| `agent-team:getMessages` | Mensajes de una sesión |
| `agent-team:clearSession` | Limpiar historial de sesión |

### Streaming del chat

```typescript
// Renderer
const { sessionId } = await window.electron.invoke('agent-team:chat', {
  teamId: 'my-team',
  message: 'Investiga X y escribe un artículo',
  context: { pathname: '/workspace/note/123', resourceTitle: 'Mi nota' },
});

// Escuchar chunks
const unsub = window.electron.on(`agent-team:chunk:${sessionId}`, (chunk) => {
  appendToChat(chunk.text, chunk.agentId);
});
```

---

## Archivos relevantes

| Archivo | Descripción |
|---------|-------------|
| `electron/ipc/agent-team.cjs` | Handler IPC del supervisor y sub-agentes |
| `electron/langgraph-agent.cjs` | LangGraph graph para los agentes |
| `electron/run-engine.cjs` | Run Engine (agentes del sistema definidos aquí) |
| `app/components/agent-team/` | UI del chat multi-agente |
| `app/components/many/ManyPanel.tsx` | Panel de Many (integra Agent Teams) |
| `app/lib/store/useAgentChatStore.ts` | Estado del chat de Agent Teams |

---

## Configuración del proveedor AI

Los Agent Teams usan el mismo proveedor AI configurado globalmente en Settings → AI Configuration. Si el proveedor es **Dome**, se usa el proxy del Provider con el token de la sesión OAuth.

```javascript
// electron/ipc/agent-team.cjs
async function getAISettings(database) {
  const provider = queries.getSetting.get('ai_provider')?.value;
  if (provider === 'dome') {
    const session = await domeOauth.getOrRefreshSession(database);
    return { provider: 'dome', apiKey: session?.accessToken, model: 'dome/auto' };
  }
  // ... otros providers
}
```

---

*Ver también: [agent-canvas.md](./agent-canvas.md) para workflows visuales, [ai-chat.md](./ai-chat.md) para Many y agentes personalizados.*
