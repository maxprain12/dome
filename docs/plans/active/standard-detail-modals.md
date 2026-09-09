---
title: Standard entity detail modals across Dome
status: complete
created: 2026-09-09
---

## Scope
User requests the Social publication modal as the standard for record details throughout Dome. Converted email, People, Seguimiento (GitHub issues/milestones), pipelines (cards/stages/run summaries), calendar events, Social directories/inbox, marketplace/plugin details and resource/note inspectors. Workspace navigation, conversation panels and full editors remain workspaces.

## Implementation
Shared DetailModal: Base UI Dialog, compact identity, localized close, bounded responsive width/height, independently scrollable content and persistent actions. DetailColumns for primary content plus context; domain-specific tabs retained. Prevent inadvertent dismissal through the backdrop for editing surfaces. Remove obsolete layout columns and automatic first-item selection. Preserve nested confirmations and explicit navigation.

## Validation
35 renderer regression tests passed across 10 files: email reply, note editing, People selection, inspector and modal keyboard/focus behavior. Two social source-content tests passed. Typecheck and build passed; lint has zero errors and 116 existing warnings. IPC inventory, Sonar patterns (full and diff), dependency boundaries, design-system and UI-contract guards passed.

Chromium fixtures verified email, pipeline, calendar, People and GitHub at 1440×900 and 390×844: no horizontal modal overflow, trapped keyboard focus, Escape dismissal and focus restoration. Reviewed screenshots; compact records use a shorter surface and wide readers separate content from context. No emails or DMs sent during verification.
