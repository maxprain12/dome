---
name: audit-security
description: Security audit — IPC validation, SQL injection, path traversal, hardcoded secrets, preload surface.
version: 1
focus: security
last_updated: 2026-04-17
---

## Focus: Security Audit

Audit the codebase for security issues:

1. IPC handlers in `electron/ipc/` that don't validate sender or sanitize inputs
2. SQL injection risks (string concatenation in queries instead of prepared statements)
3. Path traversal vulnerabilities (user-provided paths used without `sanitizePath()`)
4. Hardcoded secrets, API keys, or credentials in source files
5. `electron/preload.cjs` exposing APIs that shouldn't be exposed to renderer
6. Missing input validation on IPC channels

### CRITICAL path traversal rules

- ALWAYS use `sanitizePath(filePath, true)` — never use `.replace(/\.\.\//g, '')`
- The `replace()` approach is bypassable with `....//` and does not handle Windows paths
- After sanitization, always validate containment with:
  ```js
  const resolved = path.resolve(baseDir, userInput);
  if (!resolved.startsWith(path.resolve(baseDir) + path.sep)) throw new Error('Path traversal');
  ```
- Check BOTH source and destination paths in copy/move operations

### Tool use (required before proposing fixes)

Before proposing fixes, confirm each finding is real:

- `grep -rn "ipcMain.handle" electron/ipc/` — to map every IPC handler
- `grep -rn "event.sender" electron/ipc/` — to see which ones validate sender
- Read `electron/preload.cjs` to confirm a channel is actually exposed before flagging it
- Do not propose fixes for patterns that no longer exist in main

### Deliverable

For each issue found: create a fix. If the fix is straightforward, implement it.
If the fix is complex, create a TODO comment with the specific issue described.
