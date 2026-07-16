# Plan 020: Seguimiento full surface — inline detail (Minimal + Developer)

> **Executor**: Follow `.claude/sops/inline-detail-surfaces.md`. No Sheet for issue/milestone. Shared `InlineDetailCard`. Update this plan’s row in `plans/README.md` when done.

## Status

- **Priority**: P1
- **Effort**: L
- **Depends on**: 019 (calendar inline pattern), SOP inline-detail-surfaces
- **Category**: UI craft / surface redesign
- **Status note**: DONE (executed)

## Why

011 shipped Codex chrome but kept Sheet detail. Minimal list has overlapping labels and low-contrast titles. Developer mode must open the same right-hand Card. Pattern matches calendar events.

## Scope

Minimal + Developer (Kanban / Gantt / branches) + Issue/Milestone detail as inline column. No sync/IPC changes.

## STOP

- Do not change persisted issue format or sync policy.
- One detail surface only (never Sheet + column).
- No `*V2` / deprecated aliases.
- Do not rewrite Kanban DnD logic beyond layout classes.

## Acceptance

- Minimal: labels no overlap; title contrast OK; create usable; sort clear.
- Developer: Kanban/Gantt open the same right Card; pills shared; DnD still works.
- No Sheet when opening issue/milestone from Seguimiento.
- `pnpm run typecheck` OK.
