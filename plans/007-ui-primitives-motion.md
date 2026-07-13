# Plan 007: Motion en primitivos ui/ (transition-all, origins, durations)

> **Drift check**: `git diff --stat b500063c..HEAD -- app/components/ui/button.tsx app/components/ui/dropdown-menu.tsx app/components/ui/tooltip.tsx app/components/ui/message-scroller.tsx`

## Status

- **Priority**: P1 | **Effort**: M | **Risk**: MED | **Depends on**: 001 | **Planned at**: `b500063c`

## Why this matters

Primitivos shadcn usan `transition-all` en button/badge/tabs/switch, tooltip sin duration explícita, message-scroller exit con curva ease-in-like, DropdownMenuSubContent sin transform-origin.

## Current state

- `button.tsx` — `transition-all` + `active:translate-y-px` (AUDIT: prefer `scale(0.97)` + `transform 160ms ease-out`)
- `dropdown-menu.tsx:~139` — SubContent sin `origin-(--transform-origin)`
- `tooltip.tsx` — sin `duration-*`
- `message-scroller.tsx` — exit `duration-400` + `cubic-bezier(0.7,0,0.84,0)`

## Scope

**In scope:** `button.tsx`, `badge.tsx`, `tabs.tsx`, `switch.tsx`, `progress.tsx`, `dropdown-menu.tsx`, `tooltip.tsx`, `message-scroller.tsx`

**Out of scope:** drawer/sheet paradigm refactor (L, diferido)

## Steps

### Step 1: button.tsx

Reemplazar `transition-all` por `transition-[color,box-shadow,transform] duration-150 ease-[var(--ease-out)]`.  
Cambiar `active:translate-y-px` → `active:scale-[0.97]`.

### Step 2: badge, tabs, switch, progress

Misma sustitución: propiedades explícitas, no `all`. Switch thumb ya usa `transition-transform` — solo arreglar track.

### Step 3: dropdown-menu SubContent

Añadir `origin-(--transform-origin)` a `DropdownMenuSubContent` className (copiar de Content).

### Step 4: tooltip

Añadir `duration-150 ease-[var(--ease-out)]` al Content.

### Step 5: message-scroller

Reducir exit a `duration-200 ease-[var(--ease-out)]`; eliminar curva ease-in-like.

**Verify**: `pnpm run typecheck && pnpm run build`

## Done criteria

- [ ] `grep 'transition-all' app/components/ui/button.tsx` → 0
- [ ] SubContent tiene transform-origin
- [ ] Feel-check: botones press feedback sutil; tooltip aparece ≤200ms

## STOP conditions

- Si regenerar componente con shadcn CLI pisa cambios → usar `--diff` y merge manual.
