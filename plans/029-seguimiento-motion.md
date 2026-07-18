# Plan 029: Seguimiento — motion (panel enter, progress, tokens)

> **Executor**: Follow step by step. Touch only in-scope files. On STOP, report. Skip updating `plans/README.md` if a reviewer maintains the index.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 028 (same files; run after or same PR)
- **Category**: polish / motion
- **Planned at**: commit `4b94062e`, 2026-07-18
- **Status note**: DONE (executed + reviewed)

## Why this matters

Detail rail teleports open/closed; progress bars animate layout `width`; stats transitions ignore design tokens. Correo already uses `studio-view-enter` + CSS variables — match that crisp dashboard feel.

## Current state

- Tokens in `app/globals.css`: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`; `--duration-press` / `--duration-ui` / `--duration-overlay`; `.studio-view-enter`.
- `GitHubView.tsx` detail rail (~255): no enter class.
- `TrackingObjectiveSection.tsx` (~116): `transition-[width] duration-200`.
- `TrackingStats.tsx` (~43): `transition-colors` without duration/ease tokens.
- Exemplar: `EmailView.tsx` detail `className="… studio-view-enter …"`.

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Typecheck | `pnpm run typecheck` | exit 0 |

## Scope

**In scope:**
- `app/components/github/GitHubView.tsx`
- `app/components/github/TrackingObjectiveSection.tsx`
- `app/components/github/TrackingStats.tsx`
- `app/components/github/MilestoneDetailModal.tsx` (progress bar only if same `transition-[width]` pattern)

**Out of scope:**
- New motion library
- Animating every list row hover (must stay static for high-frequency)
- Keyboard-triggered animations

## Steps

1. Detail rail in `GitHubView`: add `studio-view-enter` to the detail column wrapper (same as Email).
2. Progress bar: replace width transition with track + fill using `origin-left scale-x-[N]` OR keep width but wrap in `motion-safe:` and use tokens:
   - Preferred: outer `bg-muted h-1 rounded-full overflow-hidden`; inner `h-full bg-primary origin-left transition-transform [transition-duration:var(--duration-ui)] [transition-timing-function:var(--ease-out)] motion-reduce:transition-none` with `style={{ transform: `scaleX(${pct/100})` }}` and `scaleX(0)` base via class `scale-x-0` overridden by style. Ensure `transform-origin: left`.
3. `TrackingStats` Card: `transition-[background-color,box-shadow] [transition-duration:var(--duration-fast)] [transition-timing-function:var(--ease-out)]` (match `MailStats` / `DomainStatChips`).
4. Optional: keyed list region `key={filter}` with `studio-view-enter` on the sections container — only if it does not remount expensive state oddly; skip if QuickAdd would remount.
5. Typecheck.

## STOP

- Do not use `scale(0)` for panel enter.
- Do not animate list row hover with transform.
- If `studio-view-enter` missing from globals, STOP (it should exist).

## Done when

- Opening a task: detail rail fades/slides in via `studio-view-enter`.
- Progress uses transform (or motion-reduce disables width anim).
- Stats use duration/ease tokens.
- `pnpm run typecheck` exit 0.
