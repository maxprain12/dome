# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Dome** is an Electron-based desktop application for knowledge management and academic research. It combines Next.js (renderer process) with Electron (main process) to provide a native desktop experience with a modern React-based UI.

**Critical Architecture Principle**: Dome uses Electron's multi-process architecture. Code in `electron/` (main process) can use Node.js/Bun APIs. Code in `app/` (renderer process) can only communicate with the main process via IPC. **Never import Node.js modules (fs, bun:sqlite, etc.) in `app/`**.

## Technology Stack

- **Runtime**: Bun for development, Node.js for Electron
- **Desktop**: Electron 32 with strict security (contextIsolation, no nodeIntegration)
- **Frontend**: Next.js 14 + React 18 (static export for Electron)
- **Database**: SQLite (better-sqlite3 in main process)
- **Vector DB**: LanceDB for semantic search
- **Editor**: Tiptap (ProseMirror-based)
- **State**: Zustand stores
- **Styling**: Tailwind CSS + CSS Variables
- **Language**: TypeScript (strict mode)

## Development Commands

```bash
# Development (recommended)
bun run electron:dev     # Start Next.js dev server + Electron with hot reload

# Development (separate)
bun run dev              # Next.js dev server only (http://localhost:3000)
bun run electron         # Electron only (must build Next.js first)

# Production Build
bun run build            # Build Next.js for production
bun run rebuild:natives  # Rebuild native modules for Electron
bun run verify:natives   # Verify native modules are correctly compiled
bun run electron:build   # Package Electron app for distribution (includes rebuild)
bun run electron:build:verbose  # Verbose build output for debugging

# Database & Testing
bun run test:db          # Test database connection and queries

# Utilities
bun run clean            # Remove build artifacts and user data
bun run generate-icons   # Generate app icons
bun run postinstall      # Install Electron native dependencies (runs automatically)
```

## Critical Architecture Rules

### Process Separation (MUST FOLLOW)

**Main Process** (`electron/*.cjs`):
- Has full Node.js/Electron API access
- Manages SQLite database via better-sqlite3
- Handles file system operations
- Creates and manages windows
- Exposes safe APIs via IPC handlers

**Renderer Process** (`app/**/*.ts`, `app/**/*.tsx`):
- Runs Next.js application
- NO direct Node.js module access
- Uses `window.electron` API (exposed via preload.cjs)
- Communicates with main process via IPC only

**Example - WRONG**:
```typescript
// ❌ NEVER do this in app/
import Database from 'bun:sqlite';
import fs from 'fs';
const db = new Database('dome.db');
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

All main process functionality is exposed via IPC channels:

1. **Main Process** (`electron/main.cjs`): Define IPC handler
```javascript
ipcMain.handle('db:projects:getAll', async (event) => {
  // Validate sender
  if (!validateSender(event.sender)) {
    throw new Error('Unauthorized');
  }

  // Execute operation
  const projects = database.getQueries().getProjects.all();
  return projects;
});
```

2. **Preload Script** (`electron/preload.cjs`): Add channel to whitelist
```javascript
const ALLOWED_CHANNELS = {
  invoke: [
    'db:projects:getAll',  // Add new channels here
    // ...
  ]
};
```

3. **Renderer** (`app/`): Call via window.electron
```typescript
const projects = await window.electron.invoke('db:projects:getAll');
```

### Database Architecture

**SQLite** (Relational):
- Main relational data (projects, resources, sources, tags)
- Metadata and relationships
- Full-text search via FTS5
- Managed in `electron/database.cjs`
- Accessed via IPC from renderer

**LanceDB** (Vector):
- Semantic search embeddings
- Resource content vectors
- AI-powered similarity search
- Accessed via IPC from renderer

**Key Tables**:
- `projects`: Project organization
- `resources`: Notes, PDFs, videos, audios, images, URLs, folders
- `sources`: Academic citations and bibliography
- `tags`: Resource tagging system
- `interactions`: PDF annotations, comments
- `settings`: User preferences and AI configuration

## Code Organization

```
dome-local/
├── electron/                    # Main Process (Node.js context)
│   ├── main.cjs                # Entry point, IPC handlers, window management
│   ├── preload.cjs             # contextBridge, whitelist IPC channels
│   ├── database.cjs            # SQLite operations (better-sqlite3)
│   ├── file-storage.cjs        # File system management
│   ├── window-manager.cjs      # Multi-window management
│   ├── security.cjs            # Input validation, path sanitization
│   ├── ai-cloud-service.cjs    # Cloud AI providers (OpenAI, Anthropic, Google)
│   ├── ai-tools-handler.cjs    # AI tool execution (web search, memory, etc.)
│   ├── ollama-service.cjs      # Local Ollama integration
│   ├── youtube-service.cjs     # YouTube metadata extraction
│   ├── web-scraper.cjs         # Playwright web content extraction
│   ├── thumbnail.cjs           # Image thumbnail generation
│   └── init.cjs                # App initialization and onboarding
│
├── app/                         # Renderer Process (Browser context)
│   ├── components/             # React components
│   │   ├── editor/             # Tiptap editor and extensions
│   │   ├── viewers/            # PDF, Video, Audio, Image viewers
│   │   ├── chat/               # AI chat interface (Martin assistant)
│   │   ├── CommandCenter/      # Cmd+K search palette
│   │   ├── settings/           # Settings panels
│   │   ├── workspace/          # Main workspace layout
│   │   └── onboarding/         # First-run setup
│   │
│   ├── lib/
│   │   ├── ai/                 # AI client and provider adapters
│   │   │   ├── client.ts       # Main AI client (unified interface)
│   │   │   ├── providers/      # Provider implementations
│   │   │   ├── tools/          # AI tool definitions
│   │   │   └── catalogs/       # Model catalogs per provider
│   │   │
│   │   ├── db/
│   │   │   └── client.ts       # IPC wrapper for database operations
│   │   │
│   │   ├── store/              # Zustand state management
│   │   │   ├── useAppStore.ts  # Global app state
│   │   │   ├── useUserStore.ts # User profile state
│   │   │   └── useMartinStore.ts # Chat state
│   │   │
│   │   ├── utils/              # Utilities (pure functions only)
│   │   ├── hooks/              # React hooks
│   │   └── settings/           # Settings management
│   │
│   ├── types/                  # TypeScript type definitions
│   ├── workspace/              # Workspace routes
│   └── settings/               # Settings routes
│
├── public/                     # Static assets
├── assets/                     # App icons, build assets
└── scripts/                    # Build and utility scripts
```

## Key Patterns

### AI Integration

Dome supports multiple AI providers through a unified client interface:

```typescript
// app/lib/ai/client.ts - Unified AI interface
import { createAIClient } from '@/lib/ai/client';

const client = createAIClient({
  provider: 'anthropic',  // or 'openai', 'google', 'ollama', etc.
  apiKey: 'sk-ant-...',
  model: 'claude-3-5-sonnet-latest'
});

// Streaming chat
const stream = await client.chat({
  messages: [...],
  tools: [...],  // Optional AI tools
  onChunk: (chunk) => { /* handle streaming */ }
});
```

AI operations that require system access (web search, file operations) are executed in the main process via `electron/ai-tools-handler.cjs`.

### Resource Management

All resources (notes, PDFs, videos, etc.) follow this pattern:

1. **Create**: Insert metadata in SQLite via IPC
2. **Store Files**: Save binary data via `electron/file-storage.cjs`
3. **Generate Embeddings**: Create vectors for semantic search (LanceDB)
4. **Link**: Associate with projects, tags, sources

```typescript
// Creating a resource
const resource = await window.electron.invoke('db:resources:create', {
  projectId: 'proj-123',
  type: 'note',
  title: 'My Note',
  content: 'Content here...'
});

// File operations via IPC
const filePath = await window.electron.invoke('resource:import', {
  resourceId: resource.id,
  filePath: '/path/to/file.pdf'
});
```

### Tiptap Editor Extensions

Custom blocks are in `app/components/editor/extensions/`:
- **Callout**: Colored info blocks with icons
- **Toggle**: Collapsible sections
- **FileBlock**: Embedded file references
- **PDFEmbed**: Inline PDF page embeds
- **ResourceMention**: @mentions linking to other resources

### Settings Management

Settings are stored in SQLite and managed via:
```typescript
// Get setting
const theme = await window.electron.invoke('db:settings:get', 'theme');

// Set setting
await window.electron.invoke('db:settings:set', {
  key: 'ai.provider',
  value: 'anthropic'
});
```

## Build & Packaging

### Development Build
- Next.js runs in dev mode with hot reload
- Electron loads from `http://localhost:3000`
- DevTools enabled

### Production Build
- Next.js exports static files to `out/`
- Electron loads from `out/index.html` via custom `app://` protocol
- electron-builder packages for macOS/Windows/Linux

### Native Dependencies
The following must be unpacked from asar (configured in package.json):
- `better-sqlite3` (native SQLite bindings)
- `sharp` (image processing)
- `vectordb`/`@lancedb/*` (vector database)

## Security Requirements

All code must follow Electron security best practices:

1. **Context Isolation**: Always enabled (`contextIsolation: true`)
2. **Node Integration**: Always disabled in renderer (`nodeIntegration: false`)
3. **IPC Validation**: All IPC handlers must validate sender and inputs
4. **Path Sanitization**: Use `sanitizePath()` for all file paths from renderer
5. **URL Validation**: Use `validateUrl()` for external URLs
6. **No Remote Module**: Never use remote module (deprecated)

See `.claude/rules/electron-best-practices.md` for comprehensive security guidelines.

## Common Pitfalls

1. **Importing Node.js in renderer**: Check if code is in `app/` - if yes, use IPC
2. **SQLite in renderer**: Use `window.electron.invoke('db:...')` instead of direct database
3. **File paths**: Always use IPC handlers, never access filesystem directly from renderer
4. **Bun vs Node**: Electron runs on Node.js, not Bun (even though we use Bun for development)
5. **better-sqlite3 vs bun:sqlite**: Use better-sqlite3 in Electron main process

## Testing

```bash
# Test database operations
bun run test:db

# Manual testing in development
bun run electron:dev
# Then open DevTools in Electron window
```

## Production Troubleshooting

If the production build is slow or features don't work:

1. **Rebuild native modules:**
```bash
bun run rebuild:natives
bun run verify:natives
```

2. **Check build output:**
```bash
# After electron:build, verify app.asar.unpacked exists
ls -la dist/mac/Dome.app/Contents/Resources/app.asar.unpacked/node_modules/
# Should show better-sqlite3, sharp, vectordb
```

3. **Enable production debugging:**
```bash
# macOS - Open DevTools with Cmd+Shift+I
# Windows/Linux - Open DevTools with Ctrl+Shift+I
```

4. **Check logs:**
```bash
# macOS
~/Library/Logs/Dome/main.log
# Windows
%USERPROFILE%\AppData\Roaming\Dome\logs\main.log
# Linux
~/.config/Dome/logs/main.log
```

See `TROUBLESHOOTING.md` for detailed solutions to common production issues.

## Performance Optimizations

The following optimizations are implemented for production:

1. **File cache in protocol handler** - Reduces filesystem calls
2. **Conditional logging** - Only logs in debug mode
3. **Non-blocking initialization** - UI shows immediately
4. **Optional VectorDB** - App works without semantic search if it fails
5. **After-pack verification** - Ensures native modules are unpacked

## Style Guide

See `.claude/rules/dome-style-guide.md` and `.claude/rules/ui-style-guidelines.md` for:
- TypeScript patterns
- React component structure
- CSS Variables usage
- Tailwind conventions
- Editor configuration (2 spaces, LF, UTF-8)

## Additional Documentation

- `.claude/rules/architecture-rules.md` - Critical architecture rules (READ FIRST)
- `.claude/rules/electron-best-practices.md` - Comprehensive Electron patterns
- `.claude/rules/dome-style-guide.md` - Code style and conventions
- `.claude/rules/ui-style-guidelines.md` - UI design system
- `README.md` - User-facing documentation and features
