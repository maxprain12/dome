# File Storage Feature (Main Process)

Documentation for Dome's internal file storage in the main process: directory layout, import/export, deduplication, and cleanup. Lives in `electron/file-storage.cjs`; renderer uses IPC (resource:*, storage:*) via db client (see docs/resources.md).

---

## Interfaces (main process)

### Storage layout

- **Base dir**: `app.getPath('userData')/dome-files` (e.g. macOS ~/Library/Application Support/Dome/dome-files).
- **Type subdirs**: TYPE_DIRECTORIES = { image: 'images', pdf: 'pdfs', video: 'videos', audio: 'audio', document: 'documents', note: 'notes', url: 'urls' }. Default for unknown type: 'documents'.
- **File path**: `{typeDir}/{hash}{ext}` (e.g. images/abc123def4567890.png). hash = first 16 chars of SHA-256 of file content (deduplication).

### Import result (returned to renderer via IPC)

- **internalPath**: Relative path (e.g. pdfs/abc123.pdf).
- **hash**: 16-char hash.
- **size**: File size in bytes.
- **mimeType**: From extension (MIME_TYPES map).
- **originalName**: Basename of source file.

### MIME_TYPES (file-storage.cjs)

- Images: jpg, png, gif, webp, svg, bmp, ico.
- PDF: pdf.
- Video: mp4, webm, mov, avi, mkv.
- Audio: mp3, wav, ogg, flac, m4a.
- Documents: doc, docx, xls, xlsx, ppt, pptx, txt, rtf, md, csv, json.
- Default: application/octet-stream.

---

## Design patterns

### Import flow

1. **Validate**: File exists at given path.
2. **Read**: fs.readFileSync(filePath) → buffer.
3. **Hash**: calculateHash(buffer) = SHA-256 first 16 chars.
4. **Path**: internalPath = `${getTypeDir(type)}/${hash}${ext}`; fullPath = join(getStorageDir(), internalPath).
5. **Dedup**: If fullPath already exists, skip copy; still return internalPath, hash, size, mimeType, originalName (caller may use existing resource or create new row).
6. **Copy**: ensureDir(dirname(fullPath)); fs.copyFileSync(filePath, fullPath).
7. **Return**: { internalPath, hash, size, mimeType, originalName }. Caller (main) updates resource row with these + thumbnail_data from thumbnail.cjs.

### Export

- **Input**: resourceId (or internalPath); destinationPath. Main resolves resource by id, gets internal_path, full path = join(getStorageDir(), internal_path), fs.copyFileSync(full, destinationPath) or createReadStream/pipe. Return destination path or error.

### Delete

- **Input**: resourceId. Main gets internal_path from resource, deletes file at full path, then DB delete (or DB delete in resource handler and then delete file). Orphan cleanup: list all internal_path from DB; list files on disk; delete files not in DB.

### Usage and cleanup

- **getUsage**: Walk dome-files dir (or read dirs per type); sum file sizes; return { total, byType, fileCount }. Optionally compare with DB to report orphans.
- **cleanup**: Find orphaned files (on disk but not in DB getAllInternalPaths); delete them; return { deleted: number, freedBytes: number }.

---

## Data flow

- **Import**: Renderer calls resource:import(filePath, projectId, type, title?) → main: file-storage.importFile(filePath, type) → get internalPath/hash/size/mime/originalName; create or update resource (createResourceWithFile or create + updateResourceFile); generate thumbnail (thumbnail.cjs) → update thumbnail_data; return ResourceImportResult to renderer.
- **Read**: resource:readFile(resourceId) → main gets resource, full path from internal_path, fs.readFileSync → return base64 data URL.
- **Export**: resource:export(resourceId, destinationPath) → main copies file to destinationPath.
- **Delete**: resource:delete(resourceId) → main deletes file (if internal_path) and DB row.
- **Cleanup**: storage:cleanup → main finds orphans, deletes, returns count/freed.

---

## Functionality

- **Import**: Copy file to dome-files/{typeDir}/{hash}{ext}; dedup by hash; return metadata for DB.
- **Export**: Copy internal file to user-chosen path.
- **Delete**: Remove file and optionally DB row (handler in main).
- **Read**: Return file content as base64 data URL for renderer (e.g. PDF viewer, image).
- **Usage**: Total and per-type size; file count.
- **Cleanup**: Remove orphaned files (not referenced in resources.internal_path).

---

## Key files

| Path | Role |
|------|------|
| `electron/file-storage.cjs` | getStorageDir, getTypeDir, getMimeType, calculateHash, ensureDir, importFile, getFilePath, readFile, deleteFile, getUsage, cleanup, export (if present) |
| `electron/main.cjs` | IPC handlers resource:import, resource:readFile, resource:getFilePath, resource:export, resource:delete, storage:getUsage, storage:cleanup, storage:getPath; call file-storage and database |
| `electron/thumbnail.cjs` | Generate thumbnail for image/PDF/video; return base64 or path; used after import |
| `electron/preload.cjs` | Exposes resource.* and storage.* to renderer |
| `app/lib/db/client.ts` | db.importFile, readResourceFile, exportResource, deleteResource, getStorageUsage, cleanupStorage, getStoragePath (see docs/resources.md) |
