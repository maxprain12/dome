# IPC and Preload Feature

Documentation for Dome's inter-process communication: channel whitelist, preload API surface, and security. Lives in `electron/preload.cjs`, `electron/main.cjs`, and `electron/security.cjs`.

---

## Design patterns

### Context isolation

- **Renderer**: No Node integration; no direct require('fs') or require('better-sqlite3'). Only `window.electron` (and exposed subset).
- **Preload**: Runs in isolated context with Node; uses contextBridge.exposeInMainWorld('electron', electronHandler). Renderer sees only electronHandler.

### Whitelist

- **ALLOWED_CHANNELS.invoke**: List of channel names allowed for ipcRenderer.invoke. Preload checks channel before forwarding; if not in list, throws.
- **ALLOWED_CHANNELS.on**: List of channel names allowed for ipcRenderer.on/once. Same check for subscriptions.
- **Adding a channel**: Add to ALLOWED_CHANNELS.invoke or .on in preload.cjs; implement handler in main.cjs; document in relevant feature doc.

### Request-response

- **Pattern**: Renderer calls window.electron.invoke(channel, ...args) → preload validates channel → ipcRenderer.invoke(channel, ...args) → main ipcMain.handle(channel, async (event, ...args) => ...) → return value to renderer.
- **Legacy**: send() is deprecated; use invoke for request-response.

### Events (main → renderer)

- **Pattern**: Main uses webContents.send or windowManager.broadcast; renderer subscribes with window.electron.on(channel, callback). Preload validates channel and forwards ipcRenderer.on(channel, subscription). Unsubscribe: return value of on() is a function that removes listener.
- **once**: For one-time events; same whitelist.

### Security (main process)

- **Validation**: security.cjs (or inline) validates sender (validateSender(event.sender)), sanitizes paths (sanitizePath), validates URLs (validateUrl). Handlers should validate/sanitize all inputs.
- **No remote**: remote module not used.

---

## Preload API surface (window.electron)

- **invoke(channel, ...args)**: Request-response; channel must be in ALLOWED_CHANNELS.invoke.
- **on(channel, callback)**: Subscribe to event; returns unsubscribe function. Channel must be in ALLOWED_CHANNELS.on.
- **once(channel, callback)**: One-time listener. Channel in ALLOWED_CHANNELS.on.
- **getUserDataPath(), getHomePath(), getAppVersion()**: System paths and version.
- **selectFile(options), selectFiles(options), selectFolder(), showSaveDialog(options)**: File dialogs.
- **openPath(filePath), showItemInFolder(filePath)**: Shell/open.
- **getTheme(), setTheme(theme), onThemeChanged(callback)**: Theme.
- **selectAvatar(), openSettings()**: User/settings.
- **avatar.copyFile(sourcePath)**: Copy avatar to app storage.
- **getPathForFile(file), getPathsForFiles(files)**: File path from File object (webUtils).
- **platform**: isMac, isWindows, isLinux, platform.
- **init**: initialize, checkOnboarding, getStatus.
- **db**: projects, resources, interactions, links, search, settings (see docs/resources.md and preload for exact methods).
- **resource**: import, importMultiple, getFilePath, readFile, export, delete, regenerateThumbnail.
- **storage**: getUsage, cleanup, getPath.
- **migration**: migrateResources, getStatus.
- **web**: scrape, get-youtube-thumbnail, save-screenshot, process.
- **ollama**: check-availability, list-models, generate-embedding, generate-summary, chat.
- **vector**: annotations index, search, delete.
- **whatsapp**: status, start, stop, logout, send, allowlist get/add/remove.
- **auth**: profiles list, create, delete; resolve, validate.
- **personality**: get-prompt, read-file, write-file, add-memory, list-files.
- **ai**: chat, stream, embeddings, checkClaudeMaxProxy.
- **ai.tools**: resourceSearch, resourceGet, resourceList, resourceSemanticSearch, projectList, projectGet, interactionList, getRecentResources, getCurrentProject.
- **window**: create, create-modal, close, list, broadcast, open-workspace, open-settings.

(Exact method names and IPC channel names are in preload.cjs; this is a summary for an AI agent.)

---

## Invoke channels (summary)

- System: get-user-data-path, get-home-path, get-app-version.
- Dialogs: select-file, select-files, select-folder, show-save-dialog.
- FS: open-path, show-item-in-folder.
- Theme: get-theme, set-theme.
- Avatar: select-avatar, avatar:copy.
- Window: window:*, init:*.
- DB: db:projects:*, db:resources:*, db:interactions:*, db:links:*, db:search:unified, db:settings:*.
- Resource: resource:*, storage:*.
- Migration: migration:*.
- Web: web:*.
- Ollama: ollama:*.
- Vector: vector:annotations:*.
- WhatsApp: whatsapp:*.
- Auth: auth:*.
- Personality: personality:*.
- AI: ai:*, ai:tools:*.

---

## On channels (main → renderer)

- theme-changed
- resource:created, resource:updated, resource:deleted
- interaction:created, interaction:updated, interaction:deleted
- project:created, project:updated, project:deleted
- whatsapp:qr, whatsapp:connected, whatsapp:disconnected
- ai:stream:chunk

---

## Key files

| Path | Role |
|------|------|
| `electron/preload.cjs` | contextBridge; ALLOWED_CHANNELS; electronHandler (invoke, on, once, db, resource, ai, etc.) |
| `electron/main.cjs` | ipcMain.handle for all invoke channels; validation; event emission |
| `electron/security.cjs` | validateSender, sanitizePath, validateUrl (if present) |
| `CLAUDE.md` | Architecture: no Node in renderer; IPC only |
