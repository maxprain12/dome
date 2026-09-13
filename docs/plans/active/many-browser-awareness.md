---
title: Many browser awareness and reviewed actions
status: implemented
---

## Evidence
The latest local browser conversation reread a dashboard but received background notification text and only one actionable element. The supplied screenshot shows different dashboard content. The reader clones detached DOM (losing CSS visibility) and ignores embedded documents and custom controls. No private chat contents are committed.

## Implementation
- Read rendered text and viewport evidence across same-origin frames and open shadow roots; explicitly report inaccessible frames and canvas limitations.
- Add bounded tables, richer live element references, native select, targeted scrolling, and bounded waiting. Preserve review and stale-target checks.
- Ensure screenshots belong to the controlled tab and failed reads cannot report success.
- Present permissions and current browser actions with Dome tokens, Many identity, cancellation, and four locales.
- Refine tool descriptions and browser grounding instructions; test with synthetic dashboards and browser integration fixtures.

## Delivery
Run project gates, extension tests/builds and focused browser smoke tests; open PR and enable squash auto-merge. Preserve unrelated working changes.

## Validation
- Root typecheck, lint (existing warnings only), build, IPC inventory, Sonar full/diff and dependency-cruiser passed.
- Extension: 31 unit tests; Electron bridge/tools: 36 tests; Chromium: 14 integration/visual tests passed.
- Chrome, Edge, Firefox and Safari builds passed. Permission cards inspected in light/dark at 320px.
- Live customer sites and the original local chat are read-only evidence; regressions use synthetic fixtures. Cross-origin/closed-shadow access remains explicitly limited.
