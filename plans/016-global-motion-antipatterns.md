# Plan 016: Motion anti-patterns globales — transition-all, width, ease-in, hover lift

> **Drift check**: `git diff --stat b500063c..HEAD -- app/styles/learn.css app/components/home/ResourceCard.tsx app/components/orchestration/ app/components/studio/`

## Status

- **Priority**: P2 | **Effort**: M | **Depends on**: 001 | **Planned at**: `b500063c`

## Why this matters

Patrón sistémico: `transition-all`, animación de `width`, hover lift en cards, flip 320ms en teclado.

## Steps — batch por archivo

1. **learn.css** — reemplazar `transition: all` en `.lr-btn`, `.lr-chip`, `.lr-card`, etc. por listas explícitas; quiz bar `width` → `scaleX`; flash flip keyboard → instant o ≤160ms ease-out
2. **ResourceCard.tsx:311** — quitar `duration-500 group-hover:scale-105`; gate con `@media (hover: hover)`
3. **AgentsStudioView/WorkflowsStudioView:403/275** — quitar `hover:-translate-y-0.5`
4. **Settings pickers** — LanguagePicker, ThemePicker, EmailProviderPicker (transition-all)
5. **studio/Quiz.tsx** — quitar transition-all en opciones teclado 1-4
6. **onboarding/** — transition-all en RoleStep, ProfileStep, etc.

**Verify**: `grep -r 'transition-all' app/components --include='*.tsx' | wc -l` — reducir ≥50% vs baseline

## Done criteria

- [ ] learn.css sin `transition: all` en clases lr-*
- [ ] ResourceCard sin scale 500ms hover
- [ ] Quiz keyboard selection sin animación perceptible
