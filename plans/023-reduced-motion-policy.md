# Plan 023: Reduced motion — global policy + component-level

> **Drift check**: `git diff --stat b500063c..HEAD -- app/globals.css app/components/shell/TabPaneShell.tsx`

## Status

- **Priority**: P2 | **Effort**: M | **Depends on**: 001, 007 | **Planned at**: `b500063c`

## Why this matters

globals.css reduced-motion mata TODO a 0.01ms (contradice AUDIT: mantener opacity/color). Features no tienen motion-reduce local. TabPaneShell blur 10px en cada tab switch.

## Steps

1. **globals.css:357-366** — suavizar: no usar `*` nuclear; scoped a `@media (prefers-reduced-motion: reduce) { .animate-in, .animate-out { animation: none } }` + `motion-reduce:transition-none` utilities documentadas
2. **TabPaneShell.tsx** — `@media (prefers-reduced-motion: reduce)` → solo opacity fade, no blur
3. Añadir `motion-reduce:animate-none` a: ResourceCard hover, ManyFloatingTrigger, ChatMessage pulse cursor, ExecutionLog pulse
4. Documentar patrón en `.claude/rules/ui-style-guidelines.md` (1 párrafo) — opcional si usuario permite docs

**Verify**: DevTools → Rendering → prefers reduced motion → tab switch sin blur; chat cursor sin pulse

## Done criteria

- [ ] globals reduced-motion no usa `*` 0.01ms blanket
- [ ] TabPaneShell sin blur en reduced motion
- [ ] ≥4 componentes high-traffic con motion-reduce classes

## STOP conditions

- Si suavizar global rompe tw-animate en overlays → scope reduced rules to feature classes only; report.
