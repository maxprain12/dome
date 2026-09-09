---
title: Social — native content and independent DM automations
status: in-progress
created: 2026-09-08
---

## Scope
- Preserve and display media, links and available source metadata from Instagram, X and LinkedIn imports, including refreshes of existing posts.
- Replace the text directory with a chronological visual feed, provider filtering and a detailed publication preview consistent with Dome tokens.
- Add a dedicated automation section backed by the existing local comment-to-DM engine: account, post, keyword, message, optional link, review/live mode, pause and delete. Event cards remain optional in their existing separate workflow.
- Preserve existing user documentation changes outside this scope.

## Validation
Provider normalization and persistence regressions; renderer feed/media and automation interaction tests; typecheck, lint, build, IPC inventory, Sonar full/diff and dependency-cruiser. Visual verification using isolated fixture data, with no messages sent or live rules activated.

## Constraints
Only details exposed by the connected provider and permissions can be imported. Independent automations use the existing desktop poller and run while Dome is open; provider restrictions still apply. No external accounts are modified during development.

## Publication modal audit — 2026-09-09
- Replaced the stacked CRM header and nested preview card with a single author header, a bounded media viewer, and a separately scrolling details column. Narrow windows stack media above the tabs; text-only posts use a narrower reading surface.
- Removed the inherited form height limit and the gallery reflow on selection. Media stays mounted across summary/comments/notes so carousel selection and video playback are preserved.
- Kept editing, publishing, original link, Many, metrics refresh, copy link, and notes. Saving notes now keeps the notes tab selected. Comments use readable text and author avatars.
- Verified the rendered modal in Chromium at desktop and narrow viewport sizes, including carousel persistence, notes input, close button and Escape. Renderer regressions cover carousel persistence and retaining the notes tab after saving.
