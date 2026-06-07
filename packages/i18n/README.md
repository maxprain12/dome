# `@dome/i18n`

Translations, split by language × namespace. Owns every UI string, split so each **feature
owns its translations** and each **language is separate**. This dismantles `app/lib/i18n.ts`
(13,215 lines, all 4 languages × every feature inline) into small, trackable files.

Leaf package. **Renderer-safe** (no Node deps) — this is the **one** package the renderer
imports directly as runtime. All other `@dome/*` packages are Node-only and may only be
imported as types from the renderer (R9).

Spec: see [`../../longrunning-task/packages/dome-i18n.md`](../../longrunning-task/packages/dome-i18n.md)
and the migration tracker in [`../../longrunning-task/`](../../longrunning-task/).
