---
title: Direct artifact lifecycle and persistent browser consent
status: in-review
---

## Evidence
The latest local browser conversation retries stale element IDs across turns, repeatedly sends a string into the underspecified artifact design object, and mistakes an ambiguous correction for a cancellation. No private conversation content is committed.

## Work
- Recover stale browser tool requests with a fresh snapshot; prohibit reuse of previous-turn IDs in instructions.
- Display a Many cursor that follows validated element actions, supports cancellation and reduced motion, and never intercepts page input.
- Add persistent, revocable per-site browser action approval while keeping browser host permissions explicit.
- Remove the artifact feeder feature from tools, IPC, UI, runtime and automation routing; preserve historical database rows without executing them.
- Remove artifact_design and its docs/registries. Provide one direct create/update lifecycle with explicit typed contracts, validated state, shared persistence and actionable validation errors.
- Rebuild the artifact workspace around preview, source/data editing, save status and export; use Dome tokens and four locales. Preserve existing HTML artifacts and spreadsheet linking.
- Validate tool parity, IPC inventory, state persistence, browser consent, UI and project gates; PR and auto-merge.

## Validation
- Desktop: typecheck, lint (existing warnings), build, IPC inventory (614 channels), Zod policy, tool coverage (144 tools), prompt parity, UI contracts, Sonar patterns and dependency boundaries.
- Renderer: 327 interaction tests; focused persistence bridge / save queue regressions also pass after final edits.
- Main: 162 security/lifecycle tests, plus dispatcher and browser-tool tests.
- Extension: 37 unit tests, typecheck, Chrome/Edge/Firefox/Safari builds and 15 Chromium E2E tests (persistent consent, revocation, visible cursor, dashboard reads and responsive themes).
- Visual review: real workspace component in Chromium; source save, invalid JSON feedback and retained iframe verified.
- Additional tool-family audit: artifacts passes; unrelated GitHub family already has 9 definitions vs 13 catalog names.

## Compatibility
Documents use `state.format=document` with Markdown and compiled HTML, retaining the existing SQLite type constraint. HTML artifacts and spreadsheet links remain supported. Retired feeder tables are not created on fresh installs; existing rows are not deleted and have no runnable routes. The content reader protocol is version 5 so existing tabs receive the cursor implementation.
