---
title: Remove unreachable implementations and obsolete dependencies
status: complete
date: 2026-09-05
---

# Purpose

Keep Dome's local-first documents, people and agent workflows while reducing
obsolete implementations. Prefer verified deletions over new abstractions.

## Scope and evidence

- Trace renderer imports from `app/main.tsx`, including lazy imports and TS aliases,
  and cross-check against tests, scripts, configuration and dynamic entry points.
- Remove disconnected team onboarding/chat, legacy Social screens and their
  exclusive helpers. Current orchestration, Social studios and inline detail
  components remain active. Keep the agent-team IPC subsystem and data types.
- Delete unused renderer filesystem/search compatibility helpers and obsolete
  Excalidraw/Bun/Next build configuration.
- Remove unreferenced Electron tool adapters and the old transcription-to-note
  helper; retain current tool registry, transcription session and registered IPC.
- Remove no-op embedding worker exports and unused legacy prompt constants.
- Remove 17 unused direct Radix/old Base UI dependencies; retain transitive
  packages still needed by other libraries and the active `@base-ui/react` stack.
- Delete two completed source-layout migration scripts. Database/profile
  migrations, worker entry points and public package APIs are preserved.

## Validation

Typecheck, lint, Vite build, renderer tests, targeted tool/prompt tests, IPC
inventory, both Sonar checks, dependency-cruiser and lockfile consistency.
No new tests or automation are needed for deletion of unreachable modules.

## Decisions

Do not merge the two live prompt assemblers: compatibility/parity tests and live
consumers justify their current separation. Do not remove orphaned EventCardPreview
or SocialStats here: both have ongoing local edits outside this independent PR.
This audit covered renderer reachability, Electron helpers, package dependencies,
scripts and build configuration; it does not certify every product behavior.
