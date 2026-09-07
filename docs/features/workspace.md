# Workspace and files

The workspace presents project resources in tabs. `UnifiedSidebar` and
`SidebarFileTree` expose the project/folder hierarchy; `useTabStore` owns open
resources and split views. Notes use `MarkdownNoteWorkspace` and the Milkdown
Markdown editor. The sidebar and folder view share their resource action menu.

## One resource file model

Every resource file is addressed by `project_id` + `vault_path`.
`electron/storage/vault-store.cjs` resolves the project root from
`projects.vault_root`, or `dome-files/vault/<sanitized project name>`.
SQLite holds identities, hierarchy, metadata and search caches. The file in the
vault is authoritative; document consumers never fall back to an old external
path or to a second content-addressed store.

DOCX and spreadsheet edits replace the canonical file atomically and refresh
its size and hashes. Filename collision checks include files that have not yet
been indexed, so imports do not overwrite them. `vault-watcher.cjs` reconciles
external edits. `vault-sync.cjs` aligns moves with the folder hierarchy, and
`resource-delete.cjs` owns cascading deletion. Storage usage counts the actual
resource files, including custom project roots.

## Imports and migration

`electron/storage/resource-import.cjs` is shared by file picker, multiple-file,
content, cloud, agent, generated-document and recording imports. Staging and
download directories are temporary inputs, not another library store.

- Markdown/plain text up to 1 MiB becomes a note; imported frontmatter is stripped
  before Dome writes its identity metadata.
- Other files retain their format, are classified by extension and registered
  before asynchronous thumbnail/text extraction. Notebook imports retain cells.
- The destination folder must belong to the project. Duplicate content is allowed;
  colliding names receive a suffix.
- Thumbnails stay in the database; no parallel thumbnail files are written.

Before the workspace starts, `vault-migration.cjs` converts pre-vault resources.
It takes a database snapshot, copies and verifies source bytes, converts old note
content to Markdown, and moves notebook execution files into a vault folder.
Original source files are retained for recovery and are never consulted by normal
resource I/O. Successful migration removes obsolete path columns and notebook
working-directory metadata. A failed row remains explicitly pending and retryable
through the migration IPC; it does not enable a compatibility mode.

## Notes, notebooks and actions

`loadNoteMarkdown` reads only the vault Markdown. The note workspace shares one
save flow for title blur, manual save and autosave. It checks errors, serializes
saves and retains edits made while a save is pending. Duplicate-note actions fail
if the source file is unavailable instead of rebuilding a note from a stale cache.

Python execution receives a notebook resource ID. Main resolves its containing
vault folder as `cwd`. The files panel imports through the library importer;
there is no separate working-folder selector. Python environment selection is
interpreter configuration and does not change the resource's location.

The header uses the shared dropdown primitives for anchoring, keyboard navigation
and focus restoration. Obsolete home document cards, toolbar, menu, annotations
panel, resize handle, unused barrels and previous-editor icons have been removed.
The inactive notes-migration settings control and placeholder upload IPC are gone.

## Validation

- `resource-vault-io.test.mjs`: imports, document I/O, collision protection,
  one-way migration/retry, notebook cwd, sync after edits, and all prepared queries
  against fresh and migrated schemas.
- `vault-mirror-create.test.mjs` and `artifact-vault-mirror.test.mjs`: mirrors,
  moves and deletion.
- Renderer tests cover note save failures/concurrent edits, sidebar actions and
  header keyboard navigation/focus restoration.
