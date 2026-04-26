---
name: audit-errors
description: Error handling & resilience — Error Boundaries, IPC try/catch, renderer .catch().
version: 2
focus: errors
last_updated: 2026-04-26
---

> **Context:** `prompts/shared/project-context.md` (v5), `AGENTS.md` (§ Baseline 2026-04).

## Focus: Error Handling & Resilience

Audit the codebase for missing error handling that causes silent failures or crashes.

1. **React Error Boundaries** — if the codebase has ZERO, that is the #1 priority.
   Add an `ErrorBoundary` component at `app/components/ErrorBoundary.tsx`:
   - Wrap each major tab/view in AppShell with it
   - Show a friendly fallback UI instead of crashing the whole app
   - Log the error to `console.error` (and PostHog if available)

2. **IPC handlers that throw instead of returning `{ success: false, error }`:**
   - Bad: `ipcMain.handle('x', () => { throw new Error('...') })`
   - Good: `ipcMain.handle('x', () => { try {...} catch(e) { return { success: false, error: e.message } } })`
   - Scan `electron/ipc/*.cjs` for handlers missing try/catch.

3. **`window.electron.invoke()` calls in the renderer with no `.catch()` or try/catch:**
   - Bad: `const result = await window.electron.invoke('x', data)`
   - Good: `const result = await window.electron.invoke('x', data).catch(e => ({ success: false, error: e.message }))`

4. **Zustand store actions** that call IPC without error handling — the store should never crash
   silently; log errors and optionally show a toast.

### Priority

ErrorBoundary first (highest impact), then IPC try/catch, then renderer catch.

### Tool use (required before proposing fixes)

- `grep -rn "ErrorBoundary" app/` — confirm before claiming "ZERO exist"
- `grep -rn "ipcMain.handle" electron/ipc/ | wc -l` — total handlers
- `grep -L "try {" electron/ipc/*.cjs` — files missing try/catch entirely
