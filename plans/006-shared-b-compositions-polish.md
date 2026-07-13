# Plan 006: Pulir composiciones legítimas en shared/ (veredicto B)

> **Drift check**: `git diff --stat b500063c..HEAD -- app/components/shared/SubpageHeader.tsx app/components/shared/SubpageFooter.tsx app/components/shared/CollapsibleRow.tsx app/components/shared/ConfirmDialog.tsx`

## Status

- **Priority**: P2 | **Effort**: S | **Risk**: LOW | **Planned at**: `b500063c`

## Why this matters

14 archivos shared son composiciones legítimas (SubpageHeader, ConfirmDialog, DatePicker, etc.). Tienen violaciones puntuales de shadcn/motion que conviene corregir sin eliminar el archivo.

## Current state — fixes concretos

1. **SubpageHeader.tsx:41-48** — `<button>` back → `Button variant="ghost" size="icon-sm"`
2. **SubpageHeader.tsx:38** — quitar `style={{ borderBottomColor }}` → `border-b border-border`
3. **SubpageFooter.tsx:41** — quitar inline border → `border-t border-border`
4. **CollapsibleRow.tsx:39,49** — añadir `duration-150 ease-[var(--ease-out)]` (requiere plan 001) en `transition-colors` y `transition-transform`
5. **ConfirmDialog.tsx:52** — migrar `AlertTriangle` de lucide-adapter a Hugeicons (alinear con DetailDrawer.tsx)
6. **Toolbar.tsx:33** — quitar `style={{ borderBottomColor }}` → `border-b border-border`

## Scope

**In scope:** 6 archivos listados arriba

**Out of scope:** DatePicker, DetailDrawer, ResourceIcon, ThemeProvider (ya correctos o sin violaciones HIGH)

## Steps

Aplicar cada fix. Ejecutar `pnpm run lint` tras cada archivo.

**Verify feel-check**: CollapsibleRow en RunLogView expand/collapse ≤200ms, sin lag.

## Done criteria

- [ ] 0 `style={{ borderBottomColor` / `borderTopColor` en esos 6 archivos
- [ ] SubpageHeader back usa Button
- [ ] ConfirmDialog usa Hugeicons
- [ ] `pnpm run typecheck` exit 0

## STOP conditions

- Si Button ghost rompe layout del header → usar `size="icon-sm"` + `className` de layout solamente.
