---
title: Polish the Dome browser extension
status: completed
created: 2026-09-10
---

Unify the injected panel with Desktop using shared neutral theme tokens, scoped typography, an accessible header and three task tabs. Reuse MarkdownNoteEditor directly with an isolated i18n provider. Embed Many within capture, notes and contacts, with contextual prompts and explicit application of results. Preserve unsaved note drafts and offer non-destructive conflict recovery. Require actual person evidence for contact extraction; support labeled manual entry and email. Validate unit, integration, browser interaction, type, lint, build and architecture checks.

The starting checkout already contains the extension and bridge as uncommitted work plus unrelated changes. Preserve that work; include only extension-related integration in the delivery.

## Result

Implemented shared theme tokens and the Desktop Markdown editor, contextual Many, validated contact forms, preserved drafts and content-based conflict detection. Local checks cover Desktop typecheck/lint/build, extension typecheck/lint, 26 unit/integration tests, 6 Chromium browser tests, four browser builds, IPC inventory, Sonar patterns and dependency boundaries. Lint retains pre-existing Desktop warnings. Browser tests use an isolated mock bridge; Safari/Firefox/Edge are build-verified only.
