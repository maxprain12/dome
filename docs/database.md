# Database Feature (Main Process)

Documentation for Dome's SQLite layer in the main process: schema, migrations, prepared queries, and FTS. Lives in `electron/database.cjs`; renderer uses IPC via `app/lib/db/client.ts` (see docs/resources.md for client API).

---

## Schema (tables)

| Table | Purpose |
|-------|---------|
| `projects` | id, name, description, parent_id, created_at, updated_at |
| `resources` | id, project_id, type, title, content, file_path, metadata, created_at, updated_at; plus internal_path, file_mime_type, file_size, file_hash, thumbnail_data, original_filename, folder_id (migrations) |
| `sources` | id, resource_id, type, title, authors, year, doi, url, publisher, journal, volume, issue, pages, isbn, metadata, created_at, updated_at |
| `citations` | id, source_id, resource_id, quote, page_number, notes, created_at |
| `tags` | id, name, color, created_at |
| `resource_tags` | resource_id, tag_id (M:N) |
| `settings` | key, value, updated_at |
| `resource_interactions` | id, resource_id, type (note|annotation|chat), content, position_data, metadata, created_at, updated_at |
| `resource_links` | id, source_id, target_id, link_type, weight, metadata, created_at |
| `search_index` | id, resource_id, combined_text, keywords, last_indexed |
| `auth_profiles` | id, provider, type (api_key|oauth|token), credentials, is_default, created_at, updated_at (migration 4) |
| `whatsapp_sessions` | id, phone_number, status, auth_data, created_at, updated_at (migration 4) |
| `whatsapp_messages` | id, session_id, from_number, message_type, content, media_path, processed, resource_id, created_at (migration 4) |
| `martin_memory` | id, type, key, value, metadata, created_at, updated_at (migration 4) |

### Virtual tables (FTS5)

- **resources_fts**: resource_id, title, content (standalone). Triggers: resources_ai/ad/au sync from resources.
- **interactions_fts**: interaction_id, content (standalone). Triggers: interactions_ai/ad/au sync from resource_interactions (content + json_extract(position_data, '$.selectedText')).

### Indexes

- resources: project_id, type, file_hash, internal_path, folder_id
- citations: source_id, resource_id
- sources: resource_id
- resource_interactions: resource_id, type
| resource_links: source_id, target_id
- search_index: resource_id
- auth_profiles: provider
- whatsapp_messages: session_id, from_number, processed
- martin_memory: type, key

---

## Migrations

- **Version** stored in `settings.schema_version` (integer).
- **Migration 1**: Add internal file storage columns to resources (internal_path, file_mime_type, file_size, file_hash, thumbnail_data, original_filename); indexes.
- **Migration 2**: Add type 'folder' to resources CHECK (recreate table if needed); add folder_id, indexes.
- **Migration 3**: Ensure folder_id column exists (add if missing).
- **Migration 4**: Add auth_profiles, whatsapp_sessions, whatsapp_messages, martin_memory tables and indexes.

---

## Prepared queries (getQueries())

- **Projects**: createProject, getProjects, getProjectById.
- **Resources**: createResource, getResourcesByProject, getResourceById, updateResource; createResourceWithFile, updateResourceFile, updateResourceThumbnail, findByHash, getAllInternalPaths, getResourcesWithLegacyPath, deleteResource; getResourcesByFolder, getRootResources, moveResourceToFolder, removeResourceFromFolder.
- **Sources**: createSource, getSources, getSourceById.
- **FTS**: searchResources (resources_fts MATCH), searchInteractions (interactions_fts MATCH).
- **Settings**: getSetting, setSetting.
- **Interactions**: createInteraction, getInteractionsByResource, getInteractionsByType, updateInteraction, deleteInteraction.
- **Links**: createLink, getLinksBySource, getLinksByTarget, deleteLink.
- **Search**: getAllResources(limit); searchForMention (LIKE title/id LIMIT 10); getBacklinks (links where target_id = ?).
- **Unified search**: Implemented in IPC handler: query resources_fts and interactions_fts, return { resources, interactions }.

---

## Design patterns

- **Lazy init**: getDB() and getQueries() create DB and prepared statements on first use.
- **WAL**: PRAGMA journal_mode = WAL; synchronous = NORMAL; foreign_keys ON.
- **FTS**: Standalone FTS tables (no external content) to avoid SQLITE_CORRUPT_VTAB; triggers keep FTS in sync.
- **Metadata/JSON**: resources.metadata, resource_interactions.position_data and metadata stored as TEXT (JSON); parse in JS.
- **IPC**: All access from renderer via IPC; main runs getQueries() and returns serializable results; see docs/resources.md and docs/ipc.md.

---

## Key files

| Path | Role |
|------|------|
| `electron/database.cjs` | getDB, initDatabase, runMigrations, populateFTSTables, createDefaultProject, getQueries, checkIntegrity; IPC handlers call these |
| `electron/main.cjs` | Registers IPC handlers for db:* (projects, resources, interactions, links, search, settings) |
| `app/lib/db/client.ts` | Renderer DB client (see docs/resources.md) |
