# Workspace and files

The workspace presents project resources in tabs. `UnifiedSidebar` and
`SidebarFileTree` expose the project/folder hierarchy; `useTabStore` owns open
resources and split views. `WorkspaceLayout` loads a resource, selects its viewer
and subscribes to `resource:updated`. Its inspector groups details, relations,
sources and Studio outputs. Notes use `MarkdownNoteWorkspace` and the Milkdown
Markdown editor.

## File ownership

`electron/storage/vault-store.cjs` resolves each project's vault root from
`projects.vault_root`, or defaults to `dome-files/vault/<sanitized project name>`.
`resources.vault_path` is relative to that root. SQLite holds the resource identity,
folder hierarchy, metadata and searchable content; note Markdown is stored in the
vault, with `resources.content` and `content_text` refreshed as fallback/search
caches when the editor writes it.

Document consumers use `getResourceFilePath`: vault path first, then legacy
`internal_path`, then `file_path`. Existing libraries still need these fallbacks.
DOCX and spreadsheet edits overwrite the resolved file atomically and refresh its
size and hashes. They must not silently create a second copy when a vault file
already exists.

`vault-watcher.cjs` reconciles external edits and imports files discovered in a
project's vault. Vault writes are marked to distinguish them from external edits.
`vault-sync.cjs` maintains folder paths on moves; `resource-delete.cjs` owns
cascading deletion. File removal precedes database deletion so the watcher cannot
reimport a file left behind.

## Importing documents

The IPC routes `resource:import`, `resource:importMultiple` and
`resource:importFromContent` share the importer in `electron/ipc/data/resources.cjs`.
The content route uses a unique temporary directory and removes it afterwards.

- `.md`, `.markdown` and `.txt` files up to 1 MiB become editable notes. Leading
  YAML frontmatter is stripped before Dome writes its own identity metadata.
- Other files are copied into the project's vault, classified by extension and
  registered in SQLite before asynchronous thumbnail/text extraction begins.
- A supplied destination folder is reflected in both the resource row and path.
- Duplicate content is allowed, as with the file picker; tracked filename
  collisions use the vault's disambiguation rules.

Agent tool `importFileToLibrary` has its own legacy import implementation in
`electron/tools/ai-tools-handler.cjs`; it is not the IPC content-import route.

## Note editing

`loadNoteMarkdown` prefers the vault file and falls back to legacy database
content. Legacy HTML/Tiptap conversion remains necessary for existing notes.
`MarkdownNoteWorkspace` uses one save flow for title blur, manual save and
1.5-second autosave. It updates the title/timestamp first, then writes the Markdown so the file
path and frontmatter use that title. Both IPC results are checked. A failed operation remains unsaved in the
editor and exposes the error. Saves cannot overlap, and edits made while a save
is pending remain dirty for the next save.

The note workspace still has an explicit focus-window action. Ordinary resource
navigation uses tabs. `WorkspaceFilesPanel` handles notebook execution files;
those directories are distinct from project vaults and may live outside them.

## Regression checks

- `electron/__tests__/resource-vault-io.test.mjs`: content imports, vault/legacy
  document I/O, export, spreadsheet writes, previews and note cache updates.
- `electron/__tests__/vault-mirror-create.test.mjs`: folder/note mirrors,
  format-preserving moves and cascade deletion.
- `app/components/notes/MarkdownNoteWorkspace.test.tsx`: save failures, title/body
  persistence and edits during an outstanding save.
