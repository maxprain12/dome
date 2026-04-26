# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Dome** is an Electron-based desktop application for knowledge management and academic research. It combines Vite + React (renderer process) with Electron (main process) to provide a native desktop experience.

**Critical Architecture Principle**: Dome uses Electron's multi-process architecture. Code in `electron/` (main process) can use Node.js APIs. Code in `app/` (renderer process) can only communicate with the main process via IPC. **Never import Node.js modules (fs, better-sqlite3, etc.) in `app/`**.

## Technology Stack

- **Runtime**: **npm** for dependency management + build; Node.js in Electron main process; lockfile **`package-lock.json`**
- **Desktop**: Electron 41 with strict security (contextIsolation, no nodeIntegration)
- **Frontend**: Vite 7 + React 18 + React Router 7 (client-side SPA, entry: `app/main.tsx`)
- **Database**: SQLite via **better-sqlite3** in the main process (standard Node stack — the renderer must use IPC, not direct DB access)
- **Semantic search**: Local Nomic embeddings in SQLite (`resource_chunks`); PDF/image text via your configured cloud LLM (vision) where applicable
- **AI**: LangChain + LangGraph for agent workflows; multi-provider (OpenAI, Anthropic, Google, Ollama)
- **State**: Zustand stores + Jotai atoms
- **Styling**: Tailwind CSS + CSS Variables + Mantine UI components
- **i18n**: react-i18next, translations in `app/lib/i18n.ts` (en/es/fr/pt)
- **Language**: TypeScript (strict mode)

## Development Commands

The project uses **npm** only; the lockfile is **`package-lock.json`**.

```bash
# Development (recommended)
npm run electron:dev            # Start Vite dev server + Electron with hot reload

# Development (separate)
npm run dev                     # Vite dev server only (http://localhost:5173)
npm run electron                # Electron only (must build Vite first)

# Production Build
npm run build                   # Build Vite for production (output: dist/)
npm run rebuild:natives         # Rebuild native modules for Electron
npm run verify:natives          # Verify native modules are correctly compiled
npm run electron:build          # Package Electron app for distribution (includes rebuild)
npm run electron:build:verbose  # Same as above with DEBUG=electron-builder output
# Database & Testing
npm run test:db          # Test database connection and queries

# Utilities
npm run clean            # Remove build artifacts and user data
npm run copy:pdf-worker  # Copy pdfjs-dist worker to public/ (auto-runs in postinstall)
npm run generate-icons   # Generate app icons
npm run postinstall      # Install Electron native dependencies (runs automatically)
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

IPC domains in `electron/ipc/`: `ai`, `ai-tools`, `agent-team`, `audio`, `auth`, `calendar`, `chat`, `cloud-llm`, `cloud-storage`, `database`, `dome-auth`, `files`, `flashcards`, `graph`, `images`, `indexing-sync`, `interactions`, `marketplace`, `mcp`, `migration`, `notebook`, `ollama`, `pdf-render`, `personality`, `plugins`, `resources`, `runs`, `semantic`, `storage`, `studio`, `sync`, `system`, `tags`, `updater`, `web`, `whatsapp`, `window`.

### Database Architecture

**SQLite** (`electron/database.cjs` via `better-sqlite3`):

- Stored at `app.getPath('userData')/dome.db`
- Key tables: `projects`, `resources`, `sources`, `tags`, `interactions`, `settings`
- Full-text search via FTS5
- Accessed via `db:*` IPC channels from renderer

**Semantic index** (`electron/services/embeddings.service.cjs`, `resource_chunks`):

- Nomic embeddings stored in SQLite; hybrid search combines FTS + graph + vectors

### Custom Protocols

- `**app://dome/`**: Production URL scheme (loads `dist/index.html`; dev loads `http://localhost:5173`)
- `**dome://**`: OAuth callback deep links for MCP integrations (single-instance lock routes these to the correct handler)

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
│   ├── services/               # Nomic embeddings, indexing.pipeline, chunking, hybrid search
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
│   │   ├── agent-canvas/       # Visual workflow canvas (D3)
│   │   ├── agent-team/         # Multi-agent team chat
│   │   ├── automations/        # Automation rules and run logs UI
│   │   ├── cloud/              # Cloud storage file picker
│   │   ├── marketplace/        # Plugin marketplace UI
│   │   ├── settings/           # Settings panels
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
├── electron/skills/bundled/     # Shipped SKILL.md packs (Claude-style Agent Skills)
├── public/
│   ├── agents/                  # Agent definition JSON bundles (one dir per agent)
│   ├── workflows/               # Workflow definition JSON files
│   ├── skills/                    # (Legacy) manifest JSON for marketplace; runtime uses SKILL.md
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

## Security Requirements

1. `contextIsolation: true`, `nodeIntegration: false` on all windows
2. All IPC channels validated against whitelist in `electron/preload.cjs`
3. All IPC handlers must validate sender and sanitize inputs
4. Use `sanitizePath()` for file paths from renderer

## Common Pitfalls

1. **SQLite**: Use `better-sqlite3` only in the main process. The renderer must not import SQLite or `node:fs` directly.
2. **SQLite in renderer**: Use `window.electron.invoke('db:...')` — never import better-sqlite3 in `app/`
3. **New IPC channel**: Must be added in both `electron/ipc/<domain>.cjs` AND `electron/preload.cjs` ALLOWED_CHANNELS
4. **Type-only imports**: Use `import type { }` due to `verbatimModuleSyntax: true`
5. **File paths**: Always use IPC handlers, never access filesystem directly from renderer

## File-based skills (Claude / Agent Skills)

- **User**: `~/.dome/skills/<id>/SKILL.md` (personal, highest priority)
- **Project (optional)**: Set *Project skills root* in **Settings > Skills**; skills load from `<root>/.dome/skills/`
- **Bundled**: `electron/skills/bundled/<id>/SKILL.md`
- **Plugins**: `userData/plugins/<pluginId>/skills/...` (id = `pluginId:folderName`)
- Main process watches these paths; the UI can call `load_skill` / `load_skill_file` tools in Many. YAML frontmatter matches Agent Skills (name, description, `disable-model-invocation`, `paths`, `context`, etc.).
- **Limitations (current)**: `allowed-tools` is stored but not auto-merged into the LangGraph tool policy; `context: fork` skills are rejected by `load_skill` (use `/skill` or the + menu instead of expecting a subagent fork).

## Additional Documentation

- `.claude/rules/architecture-rules.md` — Critical architecture rules
- `.claude/rules/electron-best-practices.md` — Electron patterns and security
- `.claude/rules/dome-style-guide.md` — Code style (note: any legacy "Next.js" mention in that file may be outdated)

## Standard Operating Procedures (SOPs)

Actionable checklists for common tasks — follow these before opening a PR or implementing a feature:

- `.claude/sops/pr-checklist.md` — Mandatory checks before every PR
- `.claude/sops/new-ipc-channel.md` — Step-by-step for adding a new IPC domain
- `.claude/sops/new-feature.md` — Full feature implementation workflow
- `.claude/sops/release.md` — How to cut a release
- `.claude/rules/ui-style-guidelines.md` — UI design system
- `.claude/rules/new-color-palette.md` — Current color palette variables

