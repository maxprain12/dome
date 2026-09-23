---
status: active
---

# CMS drafts, media and revisions

Reported: CMS saves repeatedly conflict, landing images appear broken in vault notes, and new drafts/translations remain at the vault root.

- Resolve public site images in the shared editor after plugin context arrives, preferring local vault media and falling back to the configured public site. Keep stored Markdown and editor selection unchanged.
- Place new drafts and translations in the configured collection/language folders. Reconcile previously created root drafts when listing CMS entries; moving a draft's collection/language updates its folder.
- Use a content digest for optimistic CMS updates, with the existing timestamp contract retained for older clients. Metadata-only timestamp changes must not block a save; real edits still conflict.
- Cover delayed image resolution, raw Markdown preservation, metadata-only vs real conflicts, and draft/translation folder placement with regressions.

Confirmed timestamp-only writer: `electron/storage/blob-sync.cjs` updates resource `file_hash` and `updated_at` during ingestion.

Validation: 29 plugin backend tests and 12 targeted renderer tests pass. Typecheck, lint (existing warnings), guardrails, IPC inventory, remote protocol, Sonar patterns, dependency structure and production build pass. Full renderer suite and CI pending.
