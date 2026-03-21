# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Dome** is an Electron-based desktop application for knowledge management and academic research. It combines Vite + React (renderer process) with Electron (main process) to provide a native desktop experience.

**Critical Architecture Principle**: Dome uses Electron's multi-process architecture. Code in `electron/` (main process) can use Node.js APIs. Code in `app/` (renderer process) can only communicate with the main process via IPC. **Never import Node.js modules (fs, better-sqlite3, etc.) in `app/`**.

## Technology Stack

- **Runtime**: Bun for development/build, Node.js for Electron main process
- **Desktop**: Electron 32 with strict security (contextIsolation, no nodeIntegration)
- **Frontend**: Vite 7 + React 18 + React Router 7 (client-side SPA, entry: `app/main.tsx`)
- **Database**: SQLite via **better-sqlite3** (NOT bun:sqlite — Electron runs on Node.js)
- **Vector DB**: LanceDB for semantic search
- **AI**: LangChain + LangGraph for agent workflows; multi-provider (OpenAI, Anthropic, Google, Ollama)
- **State**: Zustand stores + Jotai atoms
- **Styling**: Tailwind CSS + CSS Variables + Mantine UI components
- **i18n**: react-i18next, translations in `app/lib/i18n.ts` (en/es/fr/pt)
- **Language**: TypeScript (strict mode)

## Development Commands

```bash
# Development (recommended)
bun run electron:dev            # Start Vite dev server + Electron with hot reload

# Development (separate)
bun run dev                     # Vite dev server only (http://localhost:5173)
bun run electron                # Electron only (must build Vite first)

# Production Build
bun run build                   # Build Vite for production (output: dist/)
bun run rebuild:natives         # Rebuild native modules for Electron
bun run verify:natives          # Verify native modules are correctly compiled
bun run electron:build          # Package Electron app for distribution (includes rebuild)
bun run electron:build:verbose  # Same as above with DEBUG=electron-builder output
bun run prepare:pageindex-runtime  # Bundle Python doc-indexing runtime (auto-runs in build)

# Database & Testing
bun run test:db          # Test database connection and queries

# Utilities
bun run clean            # Remove build artifacts and user data
bun run copy:pdf-worker  # Copy pdfjs-dist worker to public/ (auto-runs in postinstall)
bun run generate-icons   # Generate app icons
bun run postinstall      # Install Electron native dependencies (runs automatically)
```

## Critical Architecture Rules

### Process Separation (MUST FOLLOW)

**Main Process** (`electron/*.cjs`):
- Has full Node.js/Electron API access
- Manages SQLite database via `better-sqlite3`
- Handles file system operations
- Creates and manages windows
- Executes AI agent workflows (LangGraph)
- Exposes safe APIs via IPC handlers in `electron/ipc/`

**Renderer Process** (`app/**/*.ts`, `app/**/*.tsx`):
- Runs Vite + React application (entry: `app/main.tsx`)
- NO direct Node.js module access
- Uses `window.electron` API (exposed via preload.cjs)
- Routes handled by React Router (client-side SPA)

**Example - WRONG**:
```typescript
// ❌ NEVER do this in app/
import Database from 'better-sqlite3';
import fs from 'fs';
```

**Example - CORRECT**:
```typescript
// ✅ In app/ - use IPC client
const projects = await window.electron.invoke('db:projects:getAll');

// ✅ In electron/database.cjs - use better-sqlite3
const Database = require('better-sqlite3');
const db = new Database(dbPath);
```

### IPC Communication Pattern

IPC handlers are organized in `electron/ipc/` (one file per domain). All channels must be whitelisted in `electron/preload.cjs` ALLOWED_CHANNELS.

1. **IPC Handler** (`electron/ipc/<domain>.cjs`): Define the handler
2. **Register** (`electron/ipc/index.cjs`): Import and register all handlers
3. **Whitelist** (`electron/preload.cjs`): Add channel to ALLOWED_CHANNELS
4. **Renderer** (`app/`): Call via `window.electron.invoke('channel', args)`

IPC domains in `electron/ipc/`: `ai`, `ai-tools`, `agent-team`, `audio`, `auth`, `calendar`, `chat`, `cloud-storage`, `database`, `dome-auth`, `files`, `flashcards`, `graph`, `images`, `interactions`, `links`, `marketplace`, `mcp`, `migration`, `notebook`, `ollama`, `pageindex`, `personality`, `plugins`, `resources`, `runs`, `storage`, `studio`, `sync`, `system`, `tags`, `updater`, `web`, `whatsapp`, `window`.

### Database Architecture

**SQLite** (`electron/database.cjs` via `better-sqlite3`):
- Stored at `app.getPath('userData')/dome.db`
- Key tables: `projects`, `resources`, `sources`, `tags`, `interactions`, `settings`
- Full-text search via FTS5
- Accessed via `db:*` IPC channels from renderer

**LanceDB** (Vector):
- Semantic search embeddings
- Accessed via IPC from renderer

### Custom Protocols

- **`app://dome/`**: Production URL scheme (loads `dist/index.html`; dev loads `http://localhost:5173`)
- **`dome://`**: OAuth callback deep links for MCP integrations (single-instance lock routes these to the correct handler)

## Code Organization

```
dome/
├── electron/                    # Main Process (Node.js context)
│   ├── main.cjs                # Entry point, window management, protocol handlers
│   ├── preload.cjs             # contextBridge, IPC channel whitelist
│   ├── database.cjs            # SQLite operations (better-sqlite3)
│   ├── ipc/                    # IPC handlers organized by domain (~35 files)
│   ├── window-manager.cjs      # Multi-window management
│   ├── ai-cloud-service.cjs    # Cloud AI providers (OpenAI, Anthropic, Google)
│   ├── langgraph-agent.cjs     # LangGraph agent execution
│   ├── ai-tools-handler.cjs    # AI tool execution (web search, memory, etc.)
│   ├── ollama-service.cjs      # Local Ollama integration
│   ├── automation-service.cjs  # Automation/scheduled task execution
│   ├── run-engine.cjs          # Agent run execution engine
│   ├── plugin-loader.cjs       # Plugin system
│   ├── marketplace-config.cjs  # Plugin marketplace
│   ├── pdf-extractor.cjs       # PDF text/page extraction
│   ├── github-client.cjs       # GitHub API integration
│   ├── crop-image.cjs          # Image cropping utilities
│   ├── pageindex_bridge.py     # Python bridge for document indexing
│   └── ppt-slide-extractor.cjs # PPTX slide extraction (hidden BrowserWindow)
│
├── app/                         # Renderer Process (Browser context)
│   ├── main.tsx                # Vite entry point (MantineProvider + BrowserRouter)
│   ├── App.tsx                 # Root React component with Routes
│   ├── pages/                  # React Router pages
│   ├── components/             # React components by feature
│   │   ├── shell/              # Single-window shell (AppShell, DomeTabBar, ContentRouter)
│   │   ├── viewers/            # PDF, Video, Audio, Image viewers
│   │   ├── chat/               # Chat message rendering (ChatMessage, ChatToolCard)
│   │   ├── many/               # "Many" AI assistant panel (ManyPanel, ManyFloatingButton)
│   │   ├── agents/             # AI agent management views
│   │   ├── agent-canvas/       # Visual workflow canvas (ReactFlow)
│   │   ├── agent-team/         # Multi-agent team chat
│   │   ├── automations/        # Automation rules and run logs UI
│   │   ├── cloud/              # Cloud storage file picker
│   │   ├── marketplace/        # Plugin marketplace UI
│   │   ├── settings/           # Settings panels
│   │   └── CommandCenter/      # Cmd+K search palette
│   │
│   ├── lib/
│   │   ├── ai/                 # AI client and provider adapters
│   │   │   ├── client.ts       # Main AI client (unified interface, multi-provider)
│   │   │   ├── providers/      # Per-provider implementations
│   │   │   ├── tools/          # AI tool definitions (web-fetch, resources, etc.)
│   │   │   ├── catalogs/       # Model catalogs per provider
│   │   │   └── models.ts       # Model definitions and capabilities
│   │   │
│   │   ├── db/
│   │   │   └── client.ts       # IPC wrapper for all database operations
│   │   │
│   │   ├── store/              # Zustand stores (one per feature domain)
│   │   ├── automations/        # Automation trigger/action logic
│   │   ├── marketplace/        # Marketplace loaders and catalog
│   │   └── utils/              # Pure utility functions
│   │
│   └── types/                  # TypeScript type definitions (global.d.ts has window.electron types)
│
├── prompts/                     # System prompt templates (martin/tools.txt, etc.)
├── public/
│   ├── agents/                  # Agent definition JSON bundles (one dir per agent)
│   ├── workflows/               # Workflow definition JSON files
│   ├── skills/                  # Skill definition files
│   ├── mcp/                     # MCP server config files
│   └── agents.json / workflows.json / skills.json  # Catalogs for the above
└── scripts/                     # Build and utility scripts
```

## Key Patterns

### Window Creation

```javascript
// Main process - create a new window at a client-side route
windowManager.create('resource-viewer', { width: 900, height: 700 }, '/resource/123');
```

### AI Integration

Multi-provider client with unified interface. Provider adapters in `app/lib/ai/providers/`. Tools defined in `app/lib/ai/tools/`. Heavy AI work (LangGraph agents, web search, MCP tool calls) runs in the main process via IPC.

```typescript
// Renderer - use the unified AI client
import { createAIClient } from '@/lib/ai/client';

// Main process - LangGraph agent workflows
// electron/langgraph-agent.cjs uses @langchain/langgraph
```

### PPT Slide Extraction

`electron/ppt-slide-extractor.cjs` creates a hidden 960×540 BrowserWindow that loads `/ppt-capture` → `app/pages/PptCapturePage.tsx`. Main process uses `executeJavaScript()` + `webContents.capturePage()` for screenshots.

### Automations & Run Engine

`electron/automation-service.cjs` manages scheduled/triggered automation rules. `electron/run-engine.cjs` executes individual agent runs (used by both automations and the Runs UI). Run state is persisted to SQLite and surfaced in `app/components/automations/RunLogView.tsx` via `runs` IPC domain.

### Shell & Tab System

Dome uses a single-window shell (`app/components/shell/AppShell.tsx`) with a browser-like tab bar. All major views (resources, settings, calendar, chat, agents, etc.) open as tabs — **not new Electron windows**.

Tab state is managed by `useTabStore` (`app/lib/store/useTabStore.ts`). To open a view as a tab, call the appropriate store action:

```typescript
import { useTabStore } from '@/lib/store/useTabStore';

const { openResourceTab, openSettingsTab, openAgentsTab } = useTabStore();
openResourceTab(resourceId, title);   // opens resource viewer tab
openSettingsTab();                     // opens settings tab
```

`ContentRouter` (`app/components/shell/ContentRouter.tsx`) maps `tab.type` to the correct component.

### Internationalization (i18n)

Uses `react-i18next`. All translations live inline in `app/lib/i18n.ts` (4 languages: en, es, fr, pt). Language is persisted to `localStorage` key `dome:language`, defaulting to `es`.

```typescript
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();
  return <span>{t('some.key')}</span>;
}
```

Add new translation keys to all four language objects in `app/lib/i18n.ts`.

### Plugin System

Plugins loaded via `electron/plugin-loader.cjs`. Marketplace config in `electron/marketplace-config.cjs`. Renderer settings UI in `app/components/settings/PluginsSettings.tsx` and `MarketplaceSettings.tsx`.

## Build & Packaging

- **Dev**: Vite on port 5173, Electron loads `http://localhost:5173`
- **Prod**: Vite builds to `dist/`, Electron loads via `app://dome/` protocol
- **Native modules** unpacked from asar: `better-sqlite3`, `sharp`, `node-pty`, `@napi-rs/canvas`, `archiver`, `yauzl`
- **pageindex-runtime**: Python-based document indexing bundled via `scripts/prepare-pageindex-runtime.cjs`

## Security Requirements

1. `contextIsolation: true`, `nodeIntegration: false` on all windows
2. All IPC channels validated against whitelist in `electron/preload.cjs`
3. All IPC handlers must validate sender and sanitize inputs
4. Use `sanitizePath()` for file paths from renderer

## Common Pitfalls

1. **`bun:sqlite` in Electron**: Electron runs Node.js, not Bun. Always use `better-sqlite3` in main process.
2. **SQLite in renderer**: Use `window.electron.invoke('db:...')` — never import better-sqlite3 in `app/`
3. **New IPC channel**: Must be added in both `electron/ipc/<domain>.cjs` AND `electron/preload.cjs` ALLOWED_CHANNELS
4. **Type-only imports**: Use `import type { }` due to `verbatimModuleSyntax: true`
5. **File paths**: Always use IPC handlers, never access filesystem directly from renderer

## Additional Documentation

- `.claude/rules/architecture-rules.md` — Critical architecture rules
- `.claude/rules/electron-best-practices.md` — Electron patterns and security
- `.claude/rules/dome-style-guide.md` — Code style (note: references to "bun:sqlite" and "Next.js" in that file are outdated)
- `.claude/rules/ui-style-guidelines.md` — UI design system
- `.claude/rules/new-color-palette.md` — Current color palette variables
