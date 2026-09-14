---
title: Creative miniapps as the default artifact experience
status: implemented
---

The user clarified that artifacts are personal, reusable miniapps: task trackers, calculators, interactive infographics, dashboards and process synoptics with KPIs. The prior report-first instructions made interactive apps an exception.

- Make working interactive HTML the default throughout Many's tool contracts and prompts; reserve Markdown documents for explicit static-document requests.
- Describe functional and accessible interaction patterns without restricting creativity to a fixed layout.
- Replace blank artifact creation with an idea composer and five editable starting ideas that open Many with a draft.
- Offer customization from the artifact workspace with the current resource pinned.
- Support explicit conversion from documents to miniapps and separate CSS changes without losing persisted data.
- Verify contracts, conversion, interaction UI, visual layout and repository gates; PR, CI and auto-merge.

## Validation

- 332 renderer tests and 164 security/service tests pass, including document-to-miniapp conversion, CSS-only customization, editable ideas and current-artifact handoff.
- Typecheck, lint (existing warnings only), production build, IPC inventory/Zod, Sonar full/diff, dependency boundaries, prompt parity, tool coverage and UI contracts pass.
- Chromium reviewed at 1000×850 and 390×780: no horizontal overflow or page errors; edited idea reaches the draft callback.
- Live model output varies by provider; the composer offers editable inspirations, not five prebuilt applications.
