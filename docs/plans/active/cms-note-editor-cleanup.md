---
title: CMS and shared note editor cleanup
status: active
created: 2026-09-23
---

## Intent

Make writing, saving and publishing reliable before adding features. Preserve the existing native CMS work present at the start of this review (backup: /tmp/dome-cms-before-review.tar.gz); do not reset it. The original branch was already merged, so continue on refactor/cms-note-editor based on current main.

## Findings and changes

- Notes use Milkdown while a large unused Tiptap component dependency set and styles remain. Use one shared Tiptap Markdown editor, remove unused packages/styles, preserve source Markdown and provide source editing for syntax outside the visual schema.
- Programmatic document loads must not produce user edits. Image uploads must return durable media references, never silently fall back to temporary blob URLs.
- CMS draft state is reset by list refreshes and navigation; save before switching entries; keep the current draft visible when saving fails. Serialize saves and preserve edits made while a request is pending. Roll back the database revision when the Markdown mirror write fails. Publish the saved revision only.
- Put writing before metadata. Add entry search, responsive navigation and visible unsaved state. Fold secondary metadata and actions instead of creating new panels.
- Remove the permanently hidden note cover and duplicated workspace controls; retain data compatibility for old documents.

## Validation

Regression tests for real Tiptap Markdown round trips, source preservation, read-only mode, document replacement and persistent images; CMS tests for draft navigation/save races/publishing; existing note persistence tests. Run the repository's typecheck, lint, UI tests, guardrails, Sonar diff, IPC inventory, remote protocol, build and dependency checks. Review the rendered interface locally. Open a PR and enable auto-merge if checks allow it.
