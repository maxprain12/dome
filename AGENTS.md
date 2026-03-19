# AGENTS.md - Dome Development Guide

This file provides guidance for agentic coding agents operating in this repository.

## Project Overview

**Dome** is an Electron-based desktop application for knowledge management and academic research. It combines Vite + React (renderer) with Electron (main process) to provide a native desktop experience.

- **Runtime**: Bun for development/build, Node.js for Electron main process
- **Desktop**: Electron 32 with strict security (contextIsolation, no nodeIntegration)
- **Frontend**: Vite 7 + React 18 + React Router 7
- **Database**: SQLite via better-sqlite3 (main process only)
- **Vector DB**: LanceDB for semantic search
- **AI**: LangChain + LangGraph
- **Editor**: Tiptap
- **State**: Zustand + Jotai
- **Styling**: Tailwind CSS + CSS Variables + Mantine UI

---

## Build/Lint/Test Commands

### Development

```bash
bun run electron:dev     # Recommended - Full app with hot reload
bun run dev              # Vite dev server only (http://localhost:5173)
bun run electron         # Electron only (requires pre-built Vite)
```

### Production Build

```bash
bun run build            # Build Vite for production (output: dist/)
bun run electron:build   # Package Electron app for distribution
bun run electron:build:verbose  # Package with verbose debug output
```

### Native Modules

```bash
bun run rebuild:natives  # Rebuild native modules for Electron
bun run verify:natives   # Verify native modules are correctly compiled
```

### Testing & Utilities

```bash
bun run test:db          # Test database connection and queries
bun run clean            # Clean build artifacts and user data
bun run generate-icons  # Generate app icons
bun run copy:pdf-worker  # Copy pdfjs-dist worker to public/
```

**Note**: This project does NOT have a standard test runner (Vitest/Jest). Testing is primarily done via manual testing and `bun run test:db`.

---

## Code Style Guidelines

### General Formatting

- **Indentation**: 2 spaces (no tabs)
- **Line endings**: LF (Unix)
- **Charset**: UTF-8
- **Trailing whitespace**: Remove
- **Final newline**: Always insert

### TypeScript

```typescript
// ✅ GOOD - Explicit types
interface Resource { id: string; title: string; type: 'note' | 'pdf' | 'video'; }
function createResource(data: Partial<Resource>): Resource { return { id: generateId(), ...data }; }
// ❌ BAD - Using any
function createResource(data: any): any { return data; }
```

**Critical**: Due to `verbatimModuleSyntax: true`, you MUST use `import type { }` for type-only imports.

### React Components

```tsx
// ✅ GOOD - Typed props with destructuring
interface Props { resource: Resource; onEdit?: (id: string) => void; }
export default function ResourceCard({ resource, onEdit }: Props) {
  return <div className="card">{resource.title}</div>;
}
```

### Imports

```typescript
// ✅ GOOD - Correct order and path aliases
import { useState } from 'react';
import type { Resource } from '@/types';
import { useAppStore } from '@/lib/store/useAppStore';
import { formatDate } from '@/lib/utils';
```

### CSS Variables vs Tailwind

```tsx
// ✅ GOOD - CSS Variables for colors, Tailwind for layout
<div style={{ backgroundColor: 'var(--bg-secondary)' }}>
<div className="flex flex-col gap-4 p-6">
// ❌ BAD - Hardcoded colors
<div style={{ backgroundColor: '#f9fafb' }}>
```

---

## Critical Architecture Rules

### Process Separation (MUST FOLLOW)

**Main Process** (`electron/*.cjs`): Has full Node.js/Electron API access, manages SQLite via better-sqlite3, handles file system operations. NEVER import Node.js modules in `app/`.

**Renderer Process** (`app/**/*.ts`, `app/**/*.tsx`): Runs Vite + React application. NO direct Node.js module access. Uses `window.electron` API via IPC. NEVER use better-sqlite3 in renderer.

```typescript
// ✅ CORRECT - Renderer uses IPC client
const projects = await window.electron.invoke('db:projects:getAll');
// ❌ WRONG - Never do this in app/
import Database from 'better-sqlite3';
```

### IPC Communication Pattern

1. **IPC Handler**: Define in `electron/ipc/<domain>.cjs`
2. **Register**: Import in `electron/ipc/index.cjs`
3. **Whitelist**: Add channel to `electron/preload.cjs` ALLOWED_CHANNELS
4. **Renderer**: Call via `window.electron.invoke('channel', args)`

### Database (SQLite)

```typescript
// ✅ GOOD - Prepared statements
const query = db.prepare('SELECT * FROM resources WHERE id = ?');
const resource = query.get(resourceId);
// ❌ BAD - String concatenation (SQL injection risk)
const query = db.exec(`SELECT * FROM resources WHERE id = '${resourceId}'`);
```

### Security Configuration

```javascript
// ✅ CORRECT - Secure Electron window
const mainWindow = new BrowserWindow({
  webPreferences: {
    nodeIntegration: false, contextIsolation: true, sandbox: true,
    preload: path.join(__dirname, 'preload.cjs'),
  }
});
```

---

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files (components) | PascalCase | `ResourceCard.tsx` |
| Files (utilities) | kebab-case | `format-date.ts` |
| Functions | camelCase | `getUserData()` |
| Components | PascalCase | `ResourceCard` |
| Interfaces | PascalCase | `Resource` |
| Constants | UPPER_SNAKE_CASE | `MAX_FILE_SIZE` |
| CSS Variables | kebab-case | `--bg-secondary` |

---

## Common Development Notes

1. **Bun as runtime** - Use `bun` not `npm`/`node` for scripts
2. **Type-only imports** - Always use `import type { }` for types due to `verbatimModuleSyntax`
3. **No test framework** - Manual testing + `bun run test:db`
4. **Electron security** - Always validate inputs in main process, never trust renderer
5. **File paths** - Always use IPC handlers, never access filesystem directly from renderer
