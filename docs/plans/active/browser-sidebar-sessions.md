---
status: active
owner: dome
---

# Browser sidebar, Many sessions and richer profiles

Replace the injected overlay with a browser-owned sidebar in Chromium and Firefox; Safari opens an extension page. Keep page access explicit. Reuse Desktop buttons, selectors, theme and Markdown editor. Share persistent Many conversations through the existing harness session repository. Add bounded browser actions (read current page, find, scroll, jump to headings) with visible user controls. Extract profile facts from the profile region and structured metadata, retaining provenance and allowing review before saving.

Validation: extractor fixtures including recommendations and non-profile pages; session continuation and authorization checks; compiled-extension browser flows; all four browser builds; repository typecheck, lint, build, IPC inventory, Sonar and dependency checks. Publish PR and enable squash auto-merge after checks.
