# Plan 028: Seguimiento — bugs + shadcn en ficha/lista

> **Executor**: Follow step by step. Touch only in-scope files. On STOP, report. Skip updating `plans/README.md` if a reviewer maintains the index.

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (020/021 already DONE)
- **Category**: bug | tech-debt
- **Planned at**: commit `4b94062e`, 2026-07-18
- **Status note**: DONE (executed + reviewed)

## Why this matters

Seguimiento already has a dashboard (021) but the detail/edit surface has illegible assignee picks, nested scroll, a broken «Todas» filter, and hand-rolled form markup. Align with Correo/Studio: shadcn Field/Command/Badge/Empty + a flex scroll chain that actually scrolls.

## Current state

- `app/components/github/IssueDetailPanel.tsx` — assignee `Button` default + `style={{ color: 'var(--foreground)' }}` (~526); view body `max-h-[min(70vh,720px)] overflow-y-auto` (~582); edit uses raw `<label>` + inline styles on `Input`/`MentionTextarea`.
- `app/components/github/TrackingDashboard.tsx` — `case 'all': return issues.filter((i) => i.state === 'open')` (~289–291).
- `app/components/github/GitHubView.tsx` — list wrapper `min-h-0 min-w-0 flex-1 overflow-hidden` without `flex flex-col` (~237); detail rail without `studio-view-enter` (028 leaves motion to 029).
- `app/components/shell/ContentRouter.tsx` — github tab wrapper missing `min-h-0` (~313).
- Exemplar scroll fix: `EmailView.tsx` list wrapper `flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden`.
- Exemplar assignee list: `Command` + `CommandInput` + `CommandList` + `CommandGroup` + `CommandItem` (see `EmailView` folder picker).
- Exemplar form: `FieldGroup` + `Field` + `FieldLabel` (shadcn skill / `app/components/ui/field.tsx`).

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Typecheck | `pnpm run typecheck` | exit 0 |
| Lint | `pnpm exec eslint app/components/github app/components/shell/ContentRouter.tsx --max-warnings 0` | exit 0 |

## Scope

**In scope:**
- `app/components/github/IssueDetailPanel.tsx`
- `app/components/github/TrackingDashboard.tsx`
- `app/components/github/GitHubView.tsx`
- `app/components/github/IssueTimeline.tsx` (empty state only if needed)
- `app/components/shell/ContentRouter.tsx` (github case `min-h-0` only)

**Out of scope:**
- Sync / OAuth / SQLite schema
- Renaming `MilestoneDetailModal` file (optional rename only if zero risk)
- Motion tokens / `studio-view-enter` (plan 029)
- Email/Social surfaces

## Steps

1. **Filter `all`**: In `TrackingDashboard` `listIssues`, `case 'all': return issues;` (all states). Keep `open`/`due_soon`/`no_objective`/`done` as today.
2. **Scroll chain**: ContentRouter github wrapper → `flex h-full min-h-0 flex-col overflow-hidden`. GitHubView list column → `flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden`. TrackingDashboard root → `h-full min-h-0 flex-1 overflow-y-auto` (drop relying on max-w alone without min-h-0).
3. **Issue detail scroll**: Remove nested `max-h-[min(70vh,720px)] overflow-y-auto` (and any inner body max-h scroll). Let `InlineDetailCard` CardContent be the single scroll owner. Use `min-w-0 w-full` on children.
4. **Assignee picker**: Replace custom `Input`+`ul`+`Button` with `Command`/`CommandInput`/`CommandList`/`CommandGroup`/`CommandItem`. Items must NOT use `Button` variant default — use `CommandItem` (ghost list row). Keep avatar + `@login`.
5. **Edit form shadcn**: Wrap title/objective/state/assignees/body in `FieldGroup` + `Field` + `FieldLabel`. Drop inline `style={{ background/border/color }}` on Inputs — use component defaults. Status chips in view mode → `Badge` variants (not inline style pills).
6. **Empty**: Where comments empty already has copy, ensure Actividad empty uses `Empty` or a single muted line if `IssueTimeline` returns null — show empty in the tab panel.
7. **Flash on issue change**: When `issueId` changes, set `body` from `initial.body` (or load path), not `setBody('')`.
8. Verify typecheck + eslint on touched paths.

## STOP

- If `Command` Base UI API differs (`render` vs `asChild`), match existing `EmailView` folder picker — do not invent.
- Do not reintroduce Sheet/Drawer for issue detail.
- Do not add Framer Motion dependency.

## Done when

- «Todas» lists open+closed issues.
- Assignee dropdown readable on light theme (no primary-filled rows).
- Detail panel has one vertical scroll; list scrolls when many tasks.
- `pnpm run typecheck` exit 0.
