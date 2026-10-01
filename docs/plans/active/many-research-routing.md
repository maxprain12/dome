---
title: Correct Many research routing and LinkedIn pending access
status: completed
---

Fix the reported main-branch profile analysis: old Social instructions route to the legacy resolver and suggest authenticated browser capture despite the pending research source. Advertise native research first, keep capabilities directly callable/visible through stubs and tool caps, prevent legacy remote LinkedIn requests while preserving existing local/connected evidence, and render an explicit pending-access card. Verify routing contracts, zero remote LinkedIn calls, local evidence, UI/i18n, and required repository checks; PR and auto-merge after CI.

Validated: 551 UI tests; 23 research/routing/public-resolver tests, tool caps/stubs, prompt parity and local reference/exploration regressions. Application and four extension builds, 16 Chromium flows, IPC/remote protocol, guardrails, lint and dependency-cruiser pass. No paid model call or live LinkedIn capture is needed or certified for this fix.
