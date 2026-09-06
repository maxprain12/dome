---
title: Simplify workspace file lifecycle
status: completed
type: refactor
---

# Workspace file lifecycle

The workspace should expose a project's files, import each document through the
same path, and report a note as saved only after its writes succeed. The vault is
the portable file store; legacy paths remain readable for existing libraries.

## Changes

- Delete the separate content-import pipeline and reuse the vault importer.
- Use the existing resource path resolver for document reads, writes and export.
- Use one note save flow for title blur, manual save and autosave; check IPC
  results, prevent overlapping saves, and keep the Markdown DB cache current.
- Keep legacy format conversion and notebook execution folders: they serve
  existing data and a different purpose from the library vault.

## Validation

Exercise imports, document I/O and note save failures with regression tests.
Run typecheck, lint, build, IPC inventory, Sonar checks and dependency-cruiser.

## Result

Removed the legacy IPC content-import implementation, duplicate frontmatter
stripping, title-only note save implementation and search-cache-based note
mirroring on moves. Shared document path resolution now covers reads, writes,
export and previews. The worker fallback receives its extractor explicitly.

Validated with 30 backend tests and 3 renderer interaction tests, typecheck,
lint (no errors; 116 existing warnings), build, IPC inventory, Sonar checks and
dependency-cruiser. No manual Electron session was used.

## Deliberately retained

Legacy internal/file paths and HTML/Tiptap conversion support existing libraries.
Notebook execution folders are distinct from library vaults. The separate agent
`importFileToLibrary` implementation and project-root naming rules need their own
migration review; this change does not claim to unify every file-producing tool.
