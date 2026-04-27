# Manual Técnico — Dome Desktop

> Referencia técnica consolidada para desarrolladores de Dome (v2.1.6).
> Asume conocimiento de TypeScript, React y Electron.

---

## Tabla de contenidos

1. [Arquitectura de procesos Electron](#1-arquitectura-de-procesos-electron)
2. [Stack tecnológico](#2-stack-tecnológico)
3. [Estructura de directorios](#3-estructura-de-directorios)
4. [IPC — Comunicación entre procesos](#4-ipc--comunicación-entre-procesos)
5. [Base de datos SQLite](#5-base-de-datos-sqlite)
6. [Indexación semántica (IA en la nube + Nomic)](#6-indexación-semántica-ia-en-la-nube--nomic) (incl. [KB LLM](#kb-llm-wiki-compilada-por-agentes))
7. [AI Integration](#7-ai-integration)
8. [Run Engine y Automatizaciones](#8-run-engine-y-automatizaciones)
9. [State Management (Zustand)](#9-state-management-zustand)
10. [Dome Editor (Tiptap)](#10-dome-editor-tiptap)
11. [Sistema de plugins](#11-sistema-de-plugins)
12. [Cloud Storage — OAuth PKCE](#12-cloud-storage--oauth-pkce)
13. [Dome Provider Integration](#13-dome-provider-integration)
14. [Build y packaging](#14-build-y-packaging)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Arquitectura de procesos Electron

Dome usa el modelo multi-proceso de Electron (similar a Chrome):

```
┌──────────────────────────────────────┐
│  Main Process  (electron/*.cjs)      │
│  ✅ Node.js completo                 │
│  ✅ better-sqlite3                   │
│  ✅ fs, child_process                │
│  ✅ Electron APIs                    │
│  ✅ LangGraph, LangChain             │
│  ✅ AI providers (directo)           │
└──────────────┬───────────────────────┘
               │
               │ contextBridge (electron/preload.cjs)
               │ window.electron (API mínima)
               ▼
┌──────────────────────────────────────┐
│  Renderer Process  (app/**/)         │
│  ✅ Vite + React + React Router      │
│  ✅ window.electron (IPC)            │
│  ❌ NO Node.js directo               │
│  ❌ NO better-sqlite3                │
│  ❌ NO fs, child_process             │
└──────────────────────────────────────┘
```

### Regla fundamental

**Todo acceso a sistema de archivos, base de datos, o APIs nativas del SO se hace desde el Main Process vía IPC.** El Renderer solo usa `window.electron.invoke()`.

```typescript
// ❌ NUNCA en app/
import Database from 'better-sqlite3'; // no existe en renderer

// ✅ SIEMPRE en app/
const data = await window.electron.invoke('db:resources:getAll', projectId);
```

---

## 2. Stack tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Runtime (dev) | npm (Node.js) | 20+ (ver `.nvmrc` / `engines` si aplica) |
| Runtime (Electron) | Node.js | 20+ |
| Desktop shell | Electron | 32 |
| Frontend bundler | Vite | 7 |
| UI framework | React | 18 |
| Routing | React Router | 7 (client-side SPA) |
| UI components | Mantine | latest |
| Styling | Tailwind CSS + CSS Variables | — |
| Database | better-sqlite3 | latest |
| Vector search | Nomic embeddings en SQLite (`resource_chunks`) | — |
| AI orchestration | LangChain + LangGraph | latest |
| AI providers | OpenAI, Anthropic, Google, Ollama, Dome | — |
| Editor | Tiptap (ProseMirror) | — |
| State (global) | Zustand | — |
| State (atomic) | Jotai | — |
| Language | TypeScript | strict mode |
| Canvas (workflows) | D3 (zoom, drag, SVG) | — |

---

## 3. Estructura de directorios

```
dome/
├── electron/                    # Main Process
│   ├── main.cjs                # Entry: app lifecycle, window, protocols, IPC
│   ├── preload.cjs             # contextBridge + ALLOWED_CHANNELS whitelist
│   ├── database.cjs            # SQLite (better-sqlite3), schema, migrations
│   ├── window-manager.cjs      # Multi-window management
│   ├── run-engine.cjs          # Agent run execution engine
│   ├── langgraph-agent.cjs     # LangGraph workflows
│   ├── ai-chat-with-tools.cjs  # AI tool definitions + streaming
│   ├── ai-tools-handler.cjs    # Tool execution (search, memory, etc.)
│   ├── automation-service.cjs  # Scheduled automation tick loop
│   ├── semantic-index-scheduler.cjs  # Cola de reindex semántico
│   ├── services/               # indexing.pipeline, embeddings, cloud-llm, chunking
│   ├── dome-oauth.cjs          # Dome Provider OAuth session management
│   ├── plugin-loader.cjs       # Plugin validation and loading
│   ├── marketplace-config.cjs  # Marketplace catalog
│   ├── pdf-extractor.cjs       # PDF text/page extraction
│   ├── ppt-slide-extractor.cjs # PPTX → screenshots (hidden BrowserWindow)
│   ├── github-client.cjs       # GitHub API
│   ├── crop-image.cjs          # Image utilities
│   ├── ollama-service.cjs      # Local Ollama
│   └── ipc/                    # IPC handlers por dominio (~35 archivos)
│       ├── ai.cjs              # ai:* channels
│       ├── agent-team.cjs      # agent-team:* channels
│       ├── runs.cjs            # runs:* channels
│       ├── storage.cjs         # storage:* channels
│       ├── dome-auth.cjs       # dome-auth:* channels
│       └── ...                 # (calendar, flashcards, studio, etc.)
│
├── app/                         # Renderer Process
│   ├── main.tsx                # Vite entry: MantineProvider + BrowserRouter
│   ├── App.tsx                 # Root routes
│   ├── pages/                  # React Router pages
│   ├── components/             # UI components por feature
│   │   ├── chat/               # ChatMessage, ArtifactCard, MarkdownRenderer
│   │   ├── many/               # ManyPanel, ManyChatHeader (floating AI)
│   │   ├── agents/             # Agent management UI
│   │   ├── agent-canvas/       # Visual workflow (D3 canvas)
│   │   ├── agent-team/         # Multi-agent chat UI
│   │   ├── automations/        # AutomationsView, RunLogView
│   │   ├── editor/             # Tiptap workspace editor
│   │   ├── viewers/            # PDF, Video, Audio, Image, URL viewers
│   │   ├── settings/           # Settings panels
│   │   ├── marketplace/        # Marketplace UI
│   │   ├── cloud/              # Cloud storage file picker
│   │
│   ├── lib/
│   │   ├── ai/                 # AI client multi-provider
│   │   │   ├── client.ts       # Unified AI client
│   │   │   ├── providers/      # Per-provider adapters
│   │   │   ├── tools/          # Tool definitions
│   │   │   ├── catalogs/       # Model catalogs
│   │   │   └── shared-capabilities.ts
│   │   ├── db/client.ts        # IPC wrapper para DB operations
│   │   ├── store/              # Zustand stores (un store por dominio)
│   │   ├── dome-editor/        # Tiptap extensions (MIT, Dome-owned)
│   │   ├── chat/               # Chat utilities, tool cards, artifacts
│   │   └── utils/              # Pure utilities
│   │
│   └── types/global.d.ts       # window.electron TypeScript types
│
├── prompts/                     # System prompt templates
├── public/
│   ├── agents/                  # Agent definition JSON bundles
│   ├── workflows/               # Workflow definitions JSON
│   ├── skills/                  # Skill definition files
│   └── mcp/                     # MCP server configs
│
└── scripts/                     # Build & utility scripts
```

---

## 4. IPC — Comunicación entre procesos

### Patrón estándar

```
Renderer                  Preload               Main Process
   │                         │                      │
   │ window.electron          │                      │
   │ .invoke('channel', args) │                      │
   │─────────────────────────►│ validates channel     │
   │                         │──────────────────────►│
   │                         │               handler │
   │                         │◄──────────────────────│
   │◄─────────────────────────│                      │
   │   { success, data }     │                      │
```

### Añadir un canal nuevo

1. **Main Process** (`electron/ipc/<domain>.cjs`):
```javascript
ipcMain.handle('myfeature:doAction', async (event, params) => {
  validateSender(event, windowManager);
  // ... lógica
  return { success: true, data: result };
});
```

2. **Whitelist** (`electron/preload.cjs`):
```javascript
const ALLOWED_CHANNELS = {
  invoke: [
    // ... canales existentes ...
    'myfeature:doAction',   // ← añadir aquí
  ],
  on: [ /* ... */ ]
};
```

3. **Renderer** (`app/`):
```typescript
const result = await window.electron.invoke('myfeature:doAction', params);
```

### Dominios IPC actuales

| Dominio | Canal base | Descripción |
|---------|-----------|-------------|
| AI | `ai:*` | Chat streaming, tool calls |
| Agent Team | `agent-team:*` | Supervisor + agentes especializados |
| Runs | `runs:*` | Run engine (start, list, cancel, resume) |
| Database | `db:*` | Projects, resources, interactions |
| Resources | `resource:*` | Import, export, file operations |
| Storage | `storage:*` | dome-files usage, cleanup |
| Semantic | `db:semantic:*`, `semantic:progress` | Embeddings, indexación, búsqueda |
| Cloud LLM | `cloud:llm:*` | Visión / transcripción PDF e imagen (proveedor del usuario) |
| Calendar | `calendar:*` | Events CRUD, Google Calendar sync |
| Flashcards | `flashcards:*` | Decks, cards, SM-2 scheduling |
| Studio | `studio:*` | Content generation |
| WhatsApp | `whatsapp:*` | Session, messages, allowlist |
| Cloud | `cloud:*` | Google Drive, OneDrive |
| Dome Auth | `dome-auth:*` | OAuth session con Provider |
| MCP | `mcp:*` | MCP server management |
| Settings | `settings:*` | Get/set settings |
| Plugins | `plugins:*` | Install, list, validate |

### Eventos Main → Renderer (push)

```javascript
// Main process
windowManager.broadcast('runs:updated', { runId, status });

// Renderer
const unsub = window.electron.on('runs:updated', (data) => { /* ... */ });
// cleanup
unsub();
```

---

## 5. Base de datos SQLite

### Ubicación

```
~/Library/Application Support/dome/dome.db   (macOS)
%APPDATA%\dome\dome.db                        (Windows)
~/.config/dome/dome.db                        (Linux)
```

### Schema principal

| Tabla | Columnas clave |
|-------|---------------|
| `projects` | id, name, description, parent_id, created_at, updated_at |
| `resources` | id, project_id, type, title, content (Tiptap JSON), file_path, internal_path, file_hash, metadata, folder_id, created_at, updated_at |
| `resource_interactions` | id, resource_id, type (note\|annotation\|chat), content, position_data, metadata |
| `settings` | key (TEXT PK), value, updated_at |
| `auth_profiles` | id, provider, type (api_key\|oauth\|token), credentials, is_default |
| `martin_memory` | id, type, key, value, metadata |
| `automations` | id, name, enabled, triggerType, schedule (JSON), agentId, prompt, outputMode, lastRunAt |
| `runs` | id, automationId, sessionId, status, agentId, prompt, outputMode, startedAt, finishedAt, error |
| `whatsapp_sessions` / `whatsapp_messages` | sesión WhatsApp y mensajes |

### FTS5 (Full-Text Search)

```sql
-- Tabla virtual resources_fts
SELECT resource_id FROM resources_fts
WHERE resources_fts MATCH 'término de búsqueda'
ORDER BY rank;

-- Tabla virtual interactions_fts
SELECT interaction_id FROM interactions_fts
WHERE interactions_fts MATCH 'texto de anotación';
```

Los triggers SQLite mantienen sincronizadas las tablas FTS automáticamente en INSERT/UPDATE/DELETE sobre `resources` e `resource_interactions`.

### Migraciones

Versionadas con `settings.schema_version`:
- **v1**: Columnas de file storage (internal_path, hash, etc.)
- **v2**: Tipo folder, folder_id
- **v3**: Asegurar folder_id
- **v4**: auth_profiles, whatsapp, martin_memory
- **v5+**: automations, runs, calendar, flashcards

### Acceso desde renderer

```typescript
// app/lib/db/client.ts — usar siempre este wrapper
import { dbClient } from '@/lib/db/client';

const projects = await dbClient.getProjects();
const resource = await dbClient.getResourceById(id);
```

---

## 6. Indexación semántica (IA en la nube + Nomic)

La búsqueda híbrida usa **chunks vectoriales locales** (Nomic en `resource_chunks`) más FTS5 y el grafo. Los PDFs y las imágenes se transcriben o describen con el **LLM en la nube** del usuario (Ajustes → IA, visión / multimodal). No hay runtime Python embebido en el proceso principal; el índice semántico vive en SQLite. La transcripción on-device vía **Gemma** se retiró en versiones recientes.

Documentación detallada: **[indexing.md](./features/indexing.md)**.

### Flujo resumido

```
Recursos → semantic-index-scheduler → indexing.pipeline.cjs
    → (texto) resource-text / cloud PDF / cloud imagen
    → chunking.cjs → embeddings Nomic → resource_chunks
```

### IPC principal

| Área | Canales / módulo |
|------|------------------|
| Embeddings / índice | `db:semantic:*`, `semantic:progress` |
| Cloud LLM (visión) | `cloud:llm:pdf-region-stream`, streaming `cloud:llm:stream-*` |
| Reindex biblioteca | `indexing:full-sync` |
| Vista página PDF (chat) | `pdf:render-page`, `ai:tools:pdfRenderPage` |

### KB LLM (wiki compilada por agentes)

Metadatos y FTS5: [kb-llm-wiki-model.md](./features/kb-llm-wiki-model.md). Si `metadata.dome_kb.reindexOnSave` es `true`, las actualizaciones pueden programar reindexación semántica vía `semantic-index-scheduler.cjs`.

---

## 7. AI Integration

### Cliente unificado

`app/lib/ai/client.ts` es la interfaz única para todos los proveedores:

```typescript
import { createAIClient } from '@/lib/ai/client';

const client = createAIClient({
  provider: 'anthropic',
  apiKey: 'sk-...',
  model: 'claude-sonnet-4-6',
});

// Streaming
for await (const chunk of client.streamChat(messages, options)) {
  if (chunk.type === 'text') updateUI(chunk.text);
  if (chunk.type === 'tool_call') handleTool(chunk);
  if (chunk.type === 'done') break;
}
```

### Proveedores soportados

| Provider ID | Modelos | Streaming | Tools | Vision |
|-------------|---------|-----------|-------|--------|
| `openai` | gpt-4o, gpt-4-turbo, o1-* | ✅ | ✅ | ✅ |
| `anthropic` | claude-*-4-*, claude-3-* | ✅ | ✅ | ✅ |
| `google` | gemini-*-flash, gemini-*-pro | ✅ | ✅ | ✅ |
| `ollama` | llama3.2, qwen2.5, etc. | ✅ | ✅ | modelos VL |
| `dome` | dome/auto (proxy al Provider) | ✅ | ✅ | Según plan |
| `openrouter` | Todos los modelos vía OR | ✅ | ✅ | Según modelo |

### LangGraph (main process)

Las conversaciones complejas y agents usan LangGraph:

```javascript
// electron/langgraph-agent.cjs
const graph = buildAgentGraph({
  agentConfig,
  tools: getToolDefinitionsByIds(toolIds),
  aiConfig: { provider, model, apiKey },
});

const runId = await runEngine.startLangGraphRun({ graph, prompt, sessionId });
```

### Herramientas de IA disponibles

Definidas en `electron/ai-chat-with-tools.cjs` y `app/lib/ai/tools/`:

| Tool | Descripción |
|------|-------------|
| `web_search` | DuckDuckGo/Brave search |
| `web_fetch` | Descarga y procesa URLs |
| `deep_research` | Investigación multi-paso |
| `resource_search` | FTS en biblioteca Dome |
| `resource_semantic_search` | Búsqueda semántica (embeddings Nomic, chunks + `page_number`) |
| `resource_get` | Lee contenido de recurso |
| `resource_create` | Crea nota nueva |
| `resource_update` | Edita nota existente |
| `create_event` / `update_event` / `delete_event` | Calendar tools |
| `flashcard_create` | Crea flashcard |
| `import_file_to_dome` | Importa archivo desde MCP |
| `image_crop` / `image_thumbnail` | Procesamiento imágenes |

---

## 8. Run Engine y Automatizaciones

### Run Engine (`electron/run-engine.cjs`)

El Run Engine ejecuta agentes en background y persiste el estado en SQLite.

**Tipos de run:**

```javascript
const OUTPUT_MODES = ['chat_only', 'note', 'studio_output', 'mixed'];

// Agentes del sistema
const SYSTEM_AGENTS = {
  research, library, writer, data, presenter, curator
};
```

**Ciclo de vida de un run:**

```
queued → running → completed
                ↘ failed
                ↘ cancelled
                ↘ waiting_approval  (requiere intervención usuario)
```

**IPC Channels:**

| Canal | Descripción |
|-------|-------------|
| `runs:get` | Obtener run por ID |
| `runs:list` | Listar runs con filtros |
| `runs:startLangGraph` | Iniciar run de agente |
| `runs:startWorkflow` | Iniciar run de workflow |
| `runs:cancel` | Cancelar run activo |
| `runs:resume` | Reanudar run con decisiones |
| `runs:getActiveBySession` | Run activo de una sesión |

**Eventos push:**

```javascript
// Main → Renderer
'runs:updated'  // { runId, status, ... }
'runs:step'     // { runId, step, ... }
'runs:chunk'    // { runId, text } — streaming
```

### Automation Service (`electron/automation-service.cjs`)

Tick loop que comprueba automations cada 60 segundos:

```javascript
// Schedule types
isDue(automation, timestamp):
  - 'daily'    → una vez al día, a la hora configurada
  - 'weekly'   → un día de la semana a la hora configurada
  - 'cron-lite' → cada N minutos (intervalMinutes)
```

---

## 9. State Management (Zustand)

Cada dominio funcional tiene su propio store en `app/lib/store/`:

| Store | Dominio |
|-------|---------|
| `useManyStore` | Chat de Many, conversaciones, agentes |
| `useAgentChatStore` | Agent Teams chat |
| `useProjectStore` | Proyectos y recursos |
| `useWorkspaceStore` | Tabs activos, layout |
| `useSettingsStore` | Configuración de la aplicación |
| `useCalendarStore` | Eventos, vista activa |
| `useFlashcardStore` | Decks y sesiones de estudio |
| `useRunStore` | Runs activos y historial |
| `useAutomationStore` | Lista de automatizaciones |

### Patrón de store

```typescript
// app/lib/store/useExampleStore.ts
interface ExampleState {
  items: Item[];
  isLoading: boolean;
  fetchItems: () => Promise<void>;
  addItem: (item: Item) => void;
}

export const useExampleStore = create<ExampleState>((set, get) => ({
  items: [],
  isLoading: false,

  fetchItems: async () => {
    set({ isLoading: true });
    const result = await window.electron.invoke('example:getAll');
    set({ items: result.data, isLoading: false });
  },

  addItem: (item) => set(state => ({ items: [...state.items, item] })),
}));
```

---

## 10. Dome Editor (Tiptap)

El editor de Dome es Tiptap con extensiones propias (MIT licensed) en `app/lib/dome-editor/`.

### Extensiones propias de Dome

| Extensión | Descripción |
|-----------|-------------|
| `DomeColumns` | Divisiones en columnas |
| `DomeCallout` | Bloques callout con icono/color |
| `DomeToggle` | Secciones desplegables |
| `DomeTable` | Tablas con drag & drop |
| `DomePDFEmbed` | PDF embebido inline |
| `DomeResourceMention` | Mención de recurso (`@`) |
| `DomeFileBlock` | Adjuntar archivos |
| `DomeSearchAndReplace` | Buscar y reemplazar en el editor |
| `DomeMarkdown` | Importar/exportar Markdown |
| `DomeComment` | Comentarios en el texto |

### Importar extensiones

```typescript
// app/lib/dome-editor/index.ts
import { DomeCallout } from '@dome-editor/callout';
// Alias configurado en vite.config.ts y tsconfig.json:
// '@dome-editor/*' → 'app/lib/dome-editor/*'
```

### Nota sobre verbatimModuleSyntax

`tsconfig.json` tiene `verbatimModuleSyntax: true`. Todos los tipos deben importarse con `import type`:

```typescript
// ✅ CORRECTO
import type { Editor } from '@tiptap/core';
import { useEditor } from '@tiptap/react';

// ❌ INCORRECTO — causa error en dev-server
import { Editor } from '@tiptap/core';
```

---

## 11. Sistema de plugins

### Estructura de un plugin

```
plugins/<plugin-id>/
├── manifest.json          # Metadatos obligatorios
├── index.html             # Entry point (para Views)
└── assets/
    └── sprites.png        # Para Pets
```

### manifest.json

```json
{
  "id": "my-pet",
  "name": "Mi Mascota",
  "author": "Author",
  "description": "Una mascota virtual",
  "version": "1.0.0",
  "type": "pet",
  "sprites": {
    "idle": [0, 0, 32, 32],
    "walk": [32, 0, 32, 32]
  },
  "permissions": ["storage:read"]
}
```

### Tipos de plugin

| Tipo | `manifest.type` | Descripción |
|------|----------------|-------------|
| Pet | `"pet"` | Mascota animada en Home |
| View | `"view"` | Vista custom en navegación lateral |

### Plugin loader (`electron/plugin-loader.cjs`)

```javascript
// Lista plugins instalados
const plugins = pluginLoader.listPlugins();

// Instalar desde .zip
await pluginLoader.installPlugin(zipPath);

// Desinstalar
pluginLoader.uninstallPlugin(pluginId);
```

Los plugins se guardan en:
```
~/Library/Application Support/dome/plugins/<plugin-id>/
```

---

## 12. Cloud Storage — OAuth PKCE

### Flujo de autorización

```
1. Dome Desktop abre ventana del OS/Browser con URL de autorización
   └── Google: accounts.google.com/o/oauth2/auth?...
   └── Microsoft: login.microsoftonline.com/...

2. Usuario autoriza → proveedor redirige a dome://cloud-storage/callback?code=...

3. Dome intercepta el deep link dome://
   └── electron/main.cjs maneja 'open-url' / process.argv

4. Intercambia code + code_verifier por access_token
   └── Almacena en auth_profiles (type: 'oauth')

5. Usa access_token para llamadas a API de Drive/OneDrive
```

### IPC channels

| Canal | Descripción |
|-------|-------------|
| `cloud:authorize` | Inicia flujo OAuth |
| `cloud:disconnect` | Revoca token |
| `cloud:listFiles` | Lista archivos/carpetas |
| `cloud:downloadFile` | Descarga archivo a dome-files |
| `cloud:getProviders` | Proveedores conectados |

---

## 13. Dome Provider Integration

### Configuración en Dome Desktop

```javascript
// electron/ipc/agent-team.cjs
const DOME_PROVIDER_URL = process.env.DOME_PROVIDER_URL || 'http://localhost:3000';
```

En desarrollo, configurar `DOME_PROVIDER_URL=http://localhost:3001` en el `.env` de Dome.

### OAuth session (`electron/dome-oauth.cjs`)

```javascript
// Obtiene o refresca sesión
const session = await domeOauth.getOrRefreshSession(database);
// session = { accessToken, userId, expiresAt }

// El accessToken se usa como Bearer en peticiones al Provider
```

### Sesiones en SQLite

La tabla `dome_provider_sessions` almacena:
- `access_token` (JWT firmado por el Provider)
- `user_id`
- `expires_at`

### Cuando usar el provider como proveedor AI

```javascript
// electron/ipc/agent-team.cjs
if (provider === 'dome') {
  const session = await domeOauth.getOrRefreshSession(database);
  return {
    provider: 'dome',
    apiKey: session?.accessToken,   // Bearer token del Provider
    model: 'dome/auto',
    baseUrl: DOME_PROVIDER_URL,
  };
}
```

---

## 14. Build y packaging

### Comandos

```bash
# Desarrollo
npm run electron:dev            # Vite + Electron hot reload
npm run dev                     # Solo Vite (port 5173)

# Producción
npm run build                   # Build Vite → dist/
npm run rebuild:natives         # Rebuild módulos nativos para Electron
npm run electron:build          # Package completo (incluye rebuild)

# Utilidades
npm run copy:pdf-worker         # Copia pdfjs-dist worker a public/
npm run clean                   # Limpia build artifacts y userData
```

### Módulos nativos (ASAR unpacked)

Los siguientes módulos se desempaquetan del ASAR:

```javascript
// package.json electron-builder config
"asarUnpack": [
  "node_modules/better-sqlite3/**",
  "node_modules/sharp/**",
  "node_modules/node-pty/**",
  "node_modules/@napi-rs/canvas/**",
  "node_modules/archiver/**",
  "node_modules/yauzl/**"
]
```

### URL de carga

| Entorno | URL |
|---------|-----|
| Desarrollo | `http://localhost:5173` |
| Producción | `app://dome/<route>` |

El protocolo `app://dome/` en producción carga `dist/index.html` con el interceptor en `electron/main.cjs`.

## 15. Troubleshooting

### Error: `existsSync is not a function`

**Causa**: Se importó `fs` o `better-sqlite3` en código del renderer (`app/`).

**Solución**: Mover la operación al main process y exponer via IPC.

### Error: `Channel not allowed`

**Causa**: Se intentó invocar un canal IPC que no está en `ALLOWED_CHANNELS`.

**Solución**: Añadir el canal a la whitelist en `electron/preload.cjs`.

### Error: `does not provide export X`

**Causa**: `verbatimModuleSyntax: true` — se importó un tipo con `import {}` en lugar de `import type {}`.

**Solución**: Cambiar a `import type { X }`.

### Electron no arranca en desarrollo

**Causa**: El puerto 5173 ya está en uso.

**Solución**:
```bash
lsof -ti:5173 | xargs kill -9
npm run electron:dev
```

### better-sqlite3 error tras actualizar Electron

**Causa**: Los módulos nativos son version-specific de Node.js/Electron.

**Solución**:
```bash
npm run rebuild:natives
# O:
npm run verify:natives
```

### IPC handler no responde

Checklist:
1. ¿El canal está en `ALLOWED_CHANNELS.invoke` del preload?
2. ¿El handler usa `ipcMain.handle()` (no `ipcMain.on()`)?
3. ¿El handler está registrado en `electron/ipc/index.cjs`?
4. ¿`validateSender` no está rechazando la petición?

---

*Manual Técnico — Dome v2.1.6*
