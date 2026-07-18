# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Dome** is an Electron-based desktop application for knowledge management and academic research. It combines Vite + React (renderer process) with Electron (main process) to provide a native desktop experience.

**Critical Architecture Principle**: Dome uses Electron's multi-process architecture. Code in `electron/` (main process) can use Node.js APIs. Code in `app/` (renderer process) can only communicate with the main process via IPC. **Never import Node.js modules (fs, better-sqlite3, etc.) in `app/`**.

## Technology Stack

- **Runtime**: **pnpm 11** for dependency management + build (requires **Node.js ≥ 22.13** for pnpm itself); Electron bundles its own runtime; lockfile **`pnpm-lock.yaml`**
- **Desktop**: Electron 41 with strict security (contextIsolation, no nodeIntegration)
- **Frontend**: Vite 7 + React 18 + React Router 7 (client-side SPA, entry: `app/main.tsx`)
- **Database**: SQLite via **better-sqlite3** in the main process (standard Node stack — the renderer must use IPC, not direct DB access)
- **Semantic search**: Configurable LangChain embeddings (OpenAI / Google / Ollama) in LanceDB (`dome-lance`); hybrid search combines FTS + graph + vectors; PDF/image text via your configured cloud LLM (vision) where applicable
- **AI**: Dome-native agent runtime (`@dome/agent-core`) for all agent runs; multi-provider (OpenAI, Anthropic, Google, Ollama). LangGraph has been fully removed — workflows are sequenced by a native topological DAG executor in `run-engine.cjs` (each node runs through the harness).
- **State**: Zustand stores + Jotai atoms
- **Styling**: Tailwind CSS + CSS Variables + **shadcn/ui** (Base UI primitives; config in `components.json`, components in `app/components/ui/`). `app/components/ui/` contains **only** original shadcn components; app-level compositions (SubpageHeader, ListState, DatePicker, ThemeProvider…) live in `app/components/shared/`. The legacy `Dome*`/`Hub*` wrappers were fully removed — see `.claude/sops/shadcn-ui.md`.
- **i18n**: react-i18next, translations in `app/lib/i18n.ts` (en/es/fr/pt)
- **Language**: TypeScript (strict mode)

## Development Commands

The project uses **pnpm** only; the lockfile is **`pnpm-lock.yaml`**.

```bash
# Development (recommended)
pnpm run electron:dev            # Start Vite dev server + Electron with hot reload

# Development (separate)
pnpm run dev                     # Vite dev server only (http://localhost:5173)
pnpm run electron                # Electron only (must build Vite first)

# Production Build
pnpm run build                   # Build Vite for production (output: dist/)
pnpm run rebuild:natives         # Rebuild native modules for Electron
pnpm run verify:natives          # Verify native modules are correctly compiled
pnpm run electron:build          # Package Electron app for distribution (includes rebuild)
pnpm run electron:build:verbose  # Same as above with DEBUG=electron-builder output
# Database & Testing
pnpm run test:db          # Test database connection and queries

# Utilities
pnpm run clean            # Remove build artifacts and user data
pnpm run copy:pdf-worker  # Copy pdfjs-dist worker to public/ (auto-runs in postinstall)
pnpm run generate-icons   # Generate app icons
pnpm run postinstall      # Install Electron native dependencies (runs automatically)
```

## Critical Architecture Rules

### Process Separation (MUST FOLLOW)

**Main Process** (`electron/*.cjs`):

- Has full Node.js/Electron API access
- Manages SQLite database via `better-sqlite3`
- Handles file system operations
- Creates and manages windows
- Executes AI agent runs (`@dome/agent-core`) and workflow orchestration
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

// ✅ In electron/core/database.cjs - use better-sqlite3
const Database = require('better-sqlite3');
const db = new Database(dbPath);
```

### IPC Communication Pattern

IPC handlers are organized in `electron/ipc/<group>/<domain>.cjs` (one file per domain, grouped into domain subfolders). All channels must be whitelisted in `electron/preload.cjs` ALLOWED_CHANNELS.

1. **IPC Handler** (`electron/ipc/<group>/<domain>.cjs`): Define the handler
2. **Register** (`electron/ipc/index.cjs`): Import (with the subfolder path) and register all handlers
3. **Whitelist** (`electron/preload.cjs`): Add channel to ALLOWED_CHANNELS
4. **Renderer** (`app/`): Call via `window.electron.invoke('channel', args)`

IPC subfolders in `electron/ipc/` (each holds one `.cjs` per domain):
- `core/`: system, window, init, shell, updater, migration
- `data/`: database, storage, files, resources, tags, graph, interactions
- `ai/`: ai, ai-tools, cloud-llm, kb-llm, semantic, embeddings, ollama
- `agents/`: agent-team, runs, chat, threads, approval, artifacts
- `media/`: audio, images, pdf-render, transcription, minimax-files, notebook
- `learn/`: learn, quiz, flashcards, studio
- `sync/`: sync, indexing-sync, cloud-sync, cloud-storage
- `integrations/`: calendar, mcp, dome-mcp, dome-auth, auth, marketplace, plugins, skills, personality, web, browser-context, feeders

`index.cjs` stays at the root of `electron/ipc/` and is the single registration entry point. Note: relative requires inside a handler resolve from `electron/ipc/<group>/`, so non-ipc modules are reached with `../../` (e.g. `require('../../ai/ai-settings.cjs')`).

### Database Architecture

**SQLite** (`electron/core/database.cjs` via `better-sqlite3`):

- Stored at `app.getPath('userData')/dome.db`
- Legacy schema HEAD: `settings.schema_version = 61` (`electron/core/db/migrations.cjs`)
- **Drizzle incremental:** `@dome/db` (`packages/db/`) — baseline post-v53, repos piloto (settings, tags); bridge in `electron/core/db/drizzle-bridge.cjs`
- FTS5 + triggers: raw SQL in `electron/core/db/fts-schema.cjs` (not Drizzle)
- Heavy reads/extraction: `electron/workers/` (db-read, document-extract)
- Accessed via `db:*` IPC channels from renderer
- Docs: [docs/features/database.md](docs/features/database.md), SOP [.claude/sops/drizzle-domain-migration.md](.claude/sops/drizzle-domain-migration.md)

**Semantic index** (`electron/services/embeddings.service.cjs`, LanceDB `dome-lance`):

- Configurable LangChain embeddings (Settings → AI → Embeddings); hybrid search combines FTS + graph + vectors

### Custom Protocols

- `**app://dome/`**: Production URL scheme (loads `dist/index.html`; dev loads `http://localhost:5173`)
- `**dome://**`: OAuth callback deep links for MCP integrations (single-instance lock routes these to the correct handler)

## Code Organization

```
dome/
├── electron/                    # Main Process (Node.js context) — modules grouped by domain
│   ├── main.cjs                # Entry point, window management, protocol handlers (anchor)
│   ├── preload.cjs             # contextBridge, IPC channel whitelist (anchor)
│   ├── dome-mcp-bridge.cjs     # stdio MCP bridge subprocess (anchor; asar-unpacked path)
│   ├── paths.cjs               # Centralized path resolution (getAppRoot/getDistDir/…) — keeps domain modules location-independent
│   ├── core/                   # init, window-manager, database, security, runtime-env, deep-link-handler, observability, update-service, install-devtools-extension
│   ├── ai/                     # llm-service (unified LLM), model-factory/params, ai-settings, auto-metadata, message-multimodal, minimax/openrouter/provider configs, dome-provider-url, openai-key
│   ├── agents/                 # agent-runtime (single Dome-native runtime → @dome/agent-core) (+context), run-engine, automation-service, kb-llm-*
│   ├── tools/                  # ai-tools-handler(+extra), tool-dispatcher/selector/cap, docx/excel/ppt tool handlers, file-tree, crop-image, browser-context-service, tool-result-*
│   ├── prompts/                # core-prompt-loader, prompts-loader, prompt-sections, prompt-budget, system-prompt
│   ├── documents/              # document-extractor/generator/staging, pdf-extractor, ppt-slide-extractor, ppt-spec-pptxgen, pptx-normalize/validate, docx-converter, notebook-python, thumbnail
│   ├── transcription/          # transcription-service/session/recovery/structured/shortcut/note-helper, tts-service, streaming-tts, audio-playback
│   ├── calendar/               # calendar-service, calendar-import/notification, calendar-sync-scheduler, google-calendar-service
│   ├── mcp/                    # dome-mcp-server, mcp-client, mcp-oauth, mcp-tool-policy (bridge stays an anchor in root)
│   ├── artifacts/              # artifact-sink, artifact-serialize, artifact-index-sync, artifact-link-sync, artifact-design-layout
│   ├── storage/                # file-storage, cloud-sync-service, hybrid-rrf, semantic-index-scheduler
│   ├── auth/                   # auth-manager, dome-oauth
│   ├── ollama/                 # ollama-service, ollama-manager(+lazy)
│   ├── marketplace/            # marketplace-config, marketplace-bundled-catalog, plugin-loader, skills-bootstrap, github-client
│   ├── feeders/                # web-scraper, html-content-extractor, youtube-service
│   ├── personality/            # personality-loader, project-memory
│   ├── ipc/                    # IPC handlers grouped into domain subfolders (core/ data/ ai/ agents/ media/ learn/ sync/ integrations/) + index.cjs
│   └── services/               # LangChain embeddings, indexing.pipeline, chunking, hybrid search, feeders, web providers
│
├── app/                         # Renderer Process (Browser context)
│   ├── main.tsx                # Vite entry point (BrowserRouter + global providers)
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
│   │   ├── orchestration/      # Agents/Workflows/Automations/Runs studio tabs (StudioHubShell)
│   │   ├── social/             # Social hub (LinkedIn/Instagram/X): composer, growth cards, AI reports
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
├── shared/prompt-assembler/     # Unified system-prompt assembler (MiniMax M-series sections)
├── prompts/                     # Editor/studio/review surfaces; core lives in packages/prompts/sections
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

**Agent runs go through the single Dome-native runtime (`@dome/agent-core`)** — see [docs/architecture/agent-runtime.md](docs/architecture/agent-runtime.md). The legacy LangGraph/LangChain/deepagents agent stack was removed. This covers Many, agent chat, agent-team, workflows, and automations. Plain LLM calls (vision, OCR, editor-ai, auto-metadata) still go through `llm-service.cjs`.

- **Agent runs**: `electron/agents/agent-runtime.cjs` — `runAgent(surface, opts)` drives `@dome/agent-core`'s `runAgentLoop` (stream → tools → repeat, argument validation, before/after tool hooks for guardrails + caps + HITL gate, compaction). Tools are built by `@dome/tools` `createToolRegistry`.
- **Plain LLM calls** (vision, OCR, editor-ai): `electron/ai/llm-service.cjs` — `chat()/stream()` backed by `createModelFromConfig()` (ChatOpenAI / ChatAnthropic / ChatGoogleGenerativeAI / ChatOllama).
- **Workflows**: `electron/agents/run-engine.cjs` — `executeWorkflowRun()` sequences nodes with a native topological DAG executor (`topologicalLevels`, level-parallel + retry); each agent node calls `runAgent('workflows', …)`. No LangGraph.
- **Tools**: defined in `app/lib/ai/tools/` (renderer-side definitions); actual execution in `electron/tools/ai-tools-handler.cjs` via `tool-dispatcher.cjs`.
- **Skills**: `~/.dome/skills/<id>/SKILL.md` — `electron/skills/index.cjs` lists them via `@dome/agent-core` `loadSkills` for the `skills:list` IPC. Skill formatting/injection primitives live in `@dome/agent-core` (`formatSkillsForSystemPrompt`). Bundled skills are seeded on first boot by `electron/marketplace/skills-bootstrap.cjs`.
- **Known gaps after the LangGraph removal** (HITL resume, sub-agent delegation, multi-agent Agent Team, thread time-travel, MCP-in-loop): see [docs/architecture/agent-runtime.md](docs/architecture/agent-runtime.md).

```typescript
// Renderer - AI calls go through IPC
const result = await window.electron.invoke('ai:chat', { provider, model, messages });
// or via runs IPC for full agent runs with tools
```

### PPT Slide Extraction

`electron/documents/ppt-slide-extractor.cjs` creates a hidden 960×540 BrowserWindow that loads `/ppt-capture` → `app/pages/PptCapturePage.tsx`. Main process uses `executeJavaScript()` + `webContents.capturePage()` for screenshots.

### Automations & Run Engine

`electron/agents/automation-service.cjs` manages scheduled/triggered automation rules. `electron/agents/run-engine.cjs` executes individual agent runs (used by both automations and the Runs UI). Run state is persisted to SQLite and surfaced in `app/components/orchestration/RunsStudioView.tsx` via `runs` IPC domain.

After a run completes, `electron/artifacts/artifact-sink.cjs` checks for automation→artifact bindings (`automation_artifact_bindings` table) and applies them: it extracts JSON from the run output and merges it into the target artifact's `state.data`, then broadcasts `artifact:updated` via `windowManager`.

### Artifacts System

Artifacts are interactive mini-apps. Two kinds:

**Kind A — Inline chat artifacts**: emitted as `\`\`\`artifact:TYPE` fenced blocks in a chat reply. Rendered ephemerally inside the message. Types (defined in `app/lib/chat/artifactSchemas.ts`): `calculator`, `diagram`, `dashboard`, `html`, `tabs`, `playground`, `timeline`, `flashcard_deck`, `calendar_event`, `chart`, `pdf_summary`, `action_items`, `list`, `created_entity`. Zod-validated at parse time; `KNOWN_ARTIFACT_TYPES` / `ZOD_VALIDATED_ARTIFACT_TYPES` control which types are promoted vs. rendered as raw code.

**Kind B — Persisted library mini-apps**: created by the agent calling the `artifact_create` tool (IPC `artifact:create`). Stored in SQLite `artifacts` table (schema in `electron/core/database.cjs`). Key fields: `resource_id`, `artifact_type`, `template` (HTML string), `state` (JSON with `data` sub-key), `linked_resource_id`.

**Iframe persistence contract** (renderer → SQLite):
- `window.DOME_DATA` — injected by Dome before each render; always read initial state from here
- `window.__dome_updateState(nextDataObject)` — call after every mutation; syncs to SQLite immediately
- `window.__dome_collectState()` — optional; called by the toolbar "Save" button
- `localStorage`/`sessionStorage` are unavailable inside the sandboxed iframe (srcdoc + no `allow-same-origin`); `app/lib/chat/artifactStorageShim.ts` injects an in-memory shim so legacy code doesn't crash

**Key files:**
- `electron/ipc/artifacts.cjs` — IPC handlers: `artifact:create`, `artifact:get`, `artifact:update`, `artifact:delete`, `artifact:list`, `artifact:export`, `artifact:import`
- `electron/artifacts/artifact-sink.cjs` — automation binding logic (`applyArtifactSinksForCompletedRun`)
- `electron/artifacts/artifact-index-sync.cjs` — semantic re-index after artifact mutation
- `electron/artifacts/artifact-serialize.cjs` — serialization helpers
- `app/components/artifacts/ArtifactWorkspaceClient.tsx` — library view (opens via tab)
- `app/components/chat/artifacts/HtmlArtifactFrame.tsx` — iframe renderer (chat + workspace)
- `app/lib/chat/artifactSchemas.ts` — Zod schemas + `parseArtifactSegments()` for streaming
- `app/lib/ai/tools/artifact-tools.ts` — agent tools (`artifact_create`, `artifact_get`, `artifact_update_state`)

**Prompt guidance** (loaded on-demand via `dome_load_doc`): `packages/tools/src/domains/artifacts/prompt.txt` (decision matrix, inline format rules) and `packages/tools/src/domains/artifacts/prompt-persisted.txt` (full `artifact_create` API + `__dome_updateState` contract).

**`linked_resource_id`**: the DB column exists and the IPC accepts it, but automatic data-refresh from the linked resource into `DOME_DATA` is not yet implemented. Currently the agent must call `excel_get` + `artifact_update_state` manually to refresh an artifact from an Excel.

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

Plugins loaded via `electron/marketplace/plugin-loader.cjs`. Marketplace config in `electron/marketplace/marketplace-config.cjs`. Renderer settings UI in `app/components/settings/PluginsSettings.tsx` and `MarketplaceSettings.tsx`.

## Build & Packaging

- **Dev**: Vite on port 5173, Electron loads `http://localhost:5173`
- **Prod**: Vite builds to `dist/`, Electron loads via `app://dome/` protocol
- **Native modules** unpacked from asar: `better-sqlite3`, `sharp`, `@napi-rs/canvas`, `archiver`, `yauzl`, `@ffmpeg-installer`

### ⚠️ asarUnpack: native modules & bundled binaries (NEVER FORGET)

**Any dependency that ships a native `.node` addon OR an executable binary that gets `spawn`/`exec`'d MUST be added to `asarUnpack` in `package.json`.** Inside `app.asar` files cannot be executed (`spawn` → `ENOTDIR`) and many native loaders cannot `dlopen` from the archive. In packaged builds this fails as an **uncaught async error that aborts the main process** — and it is invisible in dev (where modules live in plain `node_modules/`). This is exactly what crashed v2.6.0 (ffmpeg path inside `app.asar`, see PR #405).

When adding a dependency that calls a binary or loads a native addon:

1. Add its path to `asarUnpack` in `package.json` (e.g. `node_modules/<pkg>/**/*`).
2. Never pass an installer's raw `.path` to `spawn`/`setFfmpegPath`/etc. — a path inside `app.asar` is unrunnable. Rewrite `…/app.asar/…` → `…/app.asar.unpacked/…` before use. For ffmpeg/ffprobe use the helper `electron/media/ffmpeg-paths.cjs` (`toSpawnSafePath` / `configureFluentFfmpeg`); follow the same pattern for any new binary.
3. Add the module to `criticalModules` in `scripts/after-pack.cjs` so the packaged build is verified to contain the unpacked binary.
4. Degrade gracefully if the binary is missing (warn + disable the feature) — never let it throw an uncaught exception.
5. Test in a **packaged** build (`pnpm run electron:build`), not just dev — these failures only manifest after packaging.

**Enforced automatically (don't rely on memory):**
- `pnpm run check:asar-unpack` (`scripts/check-asar-unpack.cjs`) runs in CI on **every PR and every push to `main`** (CI `Lint` job). It discovers every production dependency that ships a `.node` addon or a bundled binary and **fails** if any isn't covered by an `asarUnpack` glob. It also keeps `after-pack.cjs` `criticalModules` consistent with `asarUnpack`. For a new spawned-binary installer with no `.node` file, add its name prefix to `BINARY_PACKAGE_PREFIXES` in that script.
- `scripts/after-pack.cjs` is a **hard gate** during `electron:build` / release: it throws (fails the build) if a critical module isn't in `app.asar.unpacked`, or if the platform ffmpeg binary is missing/inside `app.asar`/not executable. A broken release build cannot be produced.

## Security Requirements

1. `contextIsolation: true`, `nodeIntegration: false` on all windows
2. All IPC channels validated against whitelist in `electron/preload.cjs`
3. All IPC handlers must validate sender and sanitize inputs
4. Use `sanitizePath()` for file paths from renderer

## Component Lifecycle — No Residual Code (MANDATORY)

When replacing or rewriting a component, **never leave residual code behind**:

1. **No versioned names**: never create `FooV2`, `FooNew`, `FooRedesign`, `Foo2`. The replacement takes the original name.
2. **Delete before recreate**: when a component is superseded, first migrate ALL consumers, then **delete the old file in the same change** — only then does the new implementation exist under the old name. Never ship both.
3. **No deprecated alias re-exports**: do not leave `/** @deprecated */ export const Old = New` shims or re-export files "for incremental migration". Migrate consumers and remove the alias in the same PR.
4. **No dead variants/props**: if a prop value (e.g. `variant="legacy"`) has no callers, delete the prop and its branches — don't keep it "just in case".
5. **Prefer shadcn primitives over hand-rolled popups**: any anchored floating UI (menus, model pickers, capability panels) must use `Popover`/`DropdownMenu` from `app/components/ui/` — never `createPortal` + manual rect/click-outside tracking, and never a custom card nested inside a `*Content` neutralized with `bg-transparent border-0 shadow-none` (the base `w-(--anchor-width)`/`overflow-x-hidden` classes clip it to the trigger width — this is what broke the composer «+» menu). Exception: caret-anchored pickers (@/#//), which anchor to a text position, not an element.

## Common Pitfalls

1. **SQLite**: Use `better-sqlite3` only in the main process. The renderer must not import SQLite or `node:fs` directly.
2. **SQLite in renderer**: Use `window.electron.invoke('db:...')` — never import better-sqlite3 in `app/`
3. **New IPC channel**: Must be added in both `electron/ipc/<group>/<domain>.cjs` AND `electron/preload.cjs` ALLOWED_CHANNELS (and imported with its subfolder path in `electron/ipc/index.cjs`)
4. **Type-only imports**: Use `import type { }` due to `verbatimModuleSyntax: true`
5. **File paths**: Always use IPC handlers, never access filesystem directly from renderer
6. **Native addons / bundled binaries**: Any new dep with a `.node` addon or a spawned executable MUST be added to `asarUnpack` (and `after-pack.cjs` `criticalModules`), and its path rewritten from `app.asar` → `app.asar.unpacked` before `spawn`. See **Build & Packaging → asarUnpack**. Forgetting this crashes the packaged app only (dev is fine).
7. **Residual components**: no `*V2`/`*New` names, no deprecated alias re-exports, no dead variants — delete the old component before creating its replacement. See **Component Lifecycle — No Residual Code**.

## File-based skills (Claude / Agent Skills)

Skills are **SKILL.md** files. Every agent (Many, agent-chat, agent-team, workflow nodes) automatically has access to all skills in the user directory.

- **User dir**: `~/.dome/skills/<id>/SKILL.md` — personal skills (highest priority)
- **Bundled**: `electron/skills/bundled/<id>/SKILL.md` — copied to user dir on first boot by `electron/marketplace/skills-bootstrap.cjs` (idempotent, guarded by `skills_bundled_seeded_v2` setting)
- **IPC**: `skills:list` (returns name/description/path via `electron/skills/index.cjs` → `@dome/agent-core` `loadSkills`), `skills:openFolder` (opens user dir in Finder/Explorer)
- **Injection**: skill names+descriptions are injected into the system prompt by `@dome/agent-core` on every agent invocation. The model requests the full body via a native tool if needed.
- **No per-agent selection**: all skills in the user dir are available to every agent. `skillIds` on agent records is vestigial.

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
