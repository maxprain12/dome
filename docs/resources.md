# Resources Feature

Documentation for Dome's resource model: types, persistence, file storage, and renderer API. Lives in `app/types/index.ts`, `app/lib/db/client.ts`, `electron/database.cjs`, `electron/file-storage.cjs`, and IPC.

---

## Interfaces

### Resource and metadata (`app/types/index.ts`)

```ts
type ResourceType = 'note' | 'pdf' | 'video' | 'audio' | 'image' | 'url' | 'document' | 'folder';

interface Resource {
  id: string;
  project_id: string;
  type: ResourceType;
  title: string;
  content?: string;
  file_path?: string;           // Legacy external path (deprecated)
  internal_path?: string;      // Relative path in dome-files: "images/hash.png"
  file_mime_type?: string;
  file_size?: number;
  file_hash?: string;          // SHA-256 first 16 chars (dedup)
  thumbnail_data?: string;     // Base64 data URL for list preview
  original_filename?: string;
  folder_id?: string | null;   // Parent folder (null = root)
  metadata?: ResourceMetadata;
  created_at: number;
  updated_at: number;
}

interface ResourceMetadata {
  file_size?: number;
  file_hash?: string;
  duration?: number;
  page_count?: number;
  url?: string;
  thumbnail?: string;
  transcription?: string;
  summary?: string;
  url_type?: 'article' | 'youtube';
  scraped_content?: string;
  embedding?: number[];
  processing_status?: 'pending' | 'processing' | 'completed' | 'failed';
  processed_at?: number;
  screenshot_path?: string;
  video_id?: string;
  channel?: string;
  [key: string]: any;
}
```

### Project, search, storage (`app/types/index.ts`, `app/lib/db/client.ts`)

```ts
interface Project {
  id: string;
  name: string;
  description?: string;
  parent_id?: string;
  created_at: number;
  updated_at: number;
}

interface ResourceImportResult {
  success: boolean;
  data?: Resource;
  thumbnailDataUrl?: string;
  error?: string;
  duplicate?: { id: string; title: string; projectId: string };
}

interface StorageUsage {
  total: number;
  byType: Record<string, number>;
  fileCount: number;
}

interface DBResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

---

## Design patterns

### Process separation

- **Renderer**: Uses `app/lib/db/client.ts` singleton `db`. All access via `window.electron.db.*` and `window.electron.resource.*` (IPC). No direct Node/fs/sqlite.
- **Main**: SQLite in `electron/database.cjs` (better-sqlite3), file ops in `electron/file-storage.cjs`. IPC handlers in `electron/main.cjs`.

### Internal file storage

- Files live under `userData/dome-files/` with type subdirs: `images/`, `pdfs/`, `videos/`, `audio/`, `documents/`, `notes/`, `urls/`.
- Path format: `{typeDir}/{hash}{ext}` (e.g. `images/abc123.png`). Hash = first 16 chars of SHA-256 for deduplication.
- Import: copy file to storage, update resource with `internal_path`, `file_mime_type`, `file_size`, `file_hash`, `original_filename`. Thumbnail generated separately and stored as `thumbnail_data` (base64) on resource.

### Folders

- Resources can have `folder_id` pointing to another resource of type `folder`. Null = root of project.
- Queries: `getByFolder(folderId)`, `getRoot(projectId)`, `moveToFolder(resourceId, folderId)`, `removeFromFolder(resourceId)`.

### DB client API (renderer)

- **Projects**: `db.createProject(data)`, `db.getProjects()`, `db.getProjectById(id)`.
- **Resources**: `db.createResource(data)`, `db.getResourcesByProject(projectId)`, `db.getResourceById(id)`, `db.updateResource(id, data)`, `db.searchResources(query)`, `db.deleteResource(id)` (via resource API), plus folder APIs.
- **Interactions**: `db.createInteraction(data)`, `db.getInteractionsByResource(resourceId)`, `db.getInteractionsByType(resourceId, type)`, `db.updateInteraction(interaction)`, `db.deleteInteraction(id)`.
- **Links**: `db.createLink(data)`, `db.getLinksBySource(id)`, `db.getLinksByTarget(id)`, `db.deleteLink(id)`.
- **Search**: `db.unifiedSearch(query, options)` (FTS + filters).
- **Settings**: `db.getSetting(key)`, `db.setSetting(key, value)`.
- **File ops** (via `window.electron.resource`): `db.importFile(filePath, projectId, type, title?)`, `db.importMultipleFiles(filePaths, projectId, type?)`, `db.getResourceFilePath(resourceId)`, `db.readResourceFile(resourceId)`, `db.exportResource(resourceId, destinationPath)`, `db.deleteResource(resourceId)`, `db.regenerateThumbnail(resourceId)`.
- **Storage**: `db.getStorageUsage()`, `db.cleanupStorage()`, `db.getStoragePath()`.
- **Migration**: `db.migrateResources()`, `db.getMigrationStatus()`.

---

## Data flow

- **Create resource**: Renderer calls `db.createResource(...)` (IPC `db:resources:create`). For files: `db.importFile(...)` (IPC `resource:import`) → main runs file-storage import + DB update + thumbnail; returns `ResourceImportResult`.
- **Read**: `db.getResourceById(id)` / `db.getResourcesByProject(projectId)` etc. → IPC → main runs prepared statements, returns `DBResponse<T>`.
- **Search**: `db.searchResources(query)` or `db.unifiedSearch(query, options)` → FTS in main, results to renderer.
- **Events**: Main can emit `resource:created`, `resource:updated`, `resource:deleted`; renderer subscribes via `window.electron.on('resource:updated', ...)`.

---

## Functionality

- **CRUD** for projects and resources (create, read, update, delete) via DB client.
- **Full-text search** on resources (title, content) and interactions via FTS5; unified search can filter by type/project.
- **Import**: Single/multiple file import; type inferred or passed; duplicate detection by `file_hash`; thumbnail generation (main process).
- **Export**: Copy file from internal storage to user-chosen path.
- **Folders**: List by folder, list root, move in/out of folder.
- **Mentions/backlinks**: `searchForMention(query)`, `getBacklinks(id)` for editor @mentions and backlink UI.
- **Storage usage**: Per-type and total size; cleanup of orphaned files.
- **Migration**: Legacy `file_path` resources migrated to internal storage (copy + update row).

---

## Key files

| Path | Role |
|------|------|
| `app/types/index.ts` | Resource, ResourceMetadata, Project, ResourceType, DBResponse, StorageUsage, ResourceImportResult |
| `app/lib/db/client.ts` | DatabaseClient singleton: projects, resources, interactions, links, search, settings, import/export/storage/migration wrappers |
| `electron/database.cjs` | getDB, initDatabase, migrations, prepared statements for resources (incl. folder, internal_path, FTS) |
| `electron/file-storage.cjs` | getStorageDir, importFile, getFilePath, readFile, deleteFile, getUsage, cleanup; TYPE_DIRECTORIES, MIME_TYPES |
| `electron/main.cjs` | IPC handlers for db:*, resource:*, storage:*, migration:* |
| `electron/preload.cjs` | window.electron.db.*, window.electron.resource.*, ALLOWED_CHANNELS for invoke/on |

---

## IPC channels (resources and storage)

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `db:resources:create` | invoke | Create resource |
| `db:resources:getByProject` | invoke | List by project |
| `db:resources:getById` | invoke | Get one |
| `db:resources:update` | invoke | Update resource |
| `db:resources:search` | invoke | FTS search |
| `db:resources:getAll` | invoke | List all (limit) |
| `db:resources:delete` | invoke | Delete row only |
| `db:resources:getByFolder` | invoke | List children of folder |
| `db:resources:getRoot` | invoke | Root resources of project |
| `db:resources:moveToFolder` | invoke | Set folder_id |
| `db:resources:removeFromFolder` | invoke | Set folder_id null |
| `db:resources:searchForMention` | invoke | Search for @mention |
| `db:resources:getBacklinks` | invoke | Backlinks to resource |
| `db:resources:uploadFile` | invoke | Upload file into resource |
| `resource:import` | invoke | Import file → internal storage + resource |
| `resource:importMultiple` | invoke | Multiple import |
| `resource:getFilePath` | invoke | Absolute path for native open |
| `resource:readFile` | invoke | Base64 data URL |
| `resource:export` | invoke | Export to path |
| `resource:delete` | invoke | Delete resource + file |
| `resource:regenerateThumbnail` | invoke | Regenerate thumbnail |
| `storage:getUsage` | invoke | StorageUsage |
| `storage:cleanup` | invoke | Remove orphans |
| `storage:getPath` | invoke | Storage dir path |
| `resource:created` | on | Event when resource created |
| `resource:updated` | on | Event when resource updated |
| `resource:deleted` | on | Event when resource deleted |
