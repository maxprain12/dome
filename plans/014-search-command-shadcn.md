# Plan 014: Search — CommandPalette y SimpleSearch → Command + Dialog shadcn

> **Drift check**: `git diff --stat b500063c..HEAD -- app/components/search/`

## Status

- **Priority**: P1 | **Effort**: L | **Depends on**: 001, 007 | **Planned at**: `b500063c`

## Why this matters

`app/components/search/` tiene **cero** imports de `@/components/ui/*`. CommandPalette usa `<dialog>` nativo, blur backdrop, animación en ⌘K (100+/día → sin animación según AUDIT).

## Current state

- `CommandPalette.tsx:276-291` — blur + transition max-width
- `SimpleSearch.tsx:671-724` — dropdown absoluto manual

## Steps

1. Reimplementar CommandPalette con `Dialog` + `Command` + `CommandInput` + `CommandList` + `CommandItem`
2. **Sin animación de entrada** en CommandDialog (override `DialogContent` className: `animate-none data-open:animate-none`) — AUDIT §1
3. Eliminar backdrop blur o limitar a opacity fade ≤150ms
4. SimpleSearch results → Popover + Command o Combobox pattern
5. Spinners DIY → `Spinner` de ui/

**Verify**: ⌘K abre instantáneo; navegación flechas OK; preview panel sin jank

## Done criteria

- [ ] search/ importa Command, Dialog, Spinner
- [ ] 0 `<dialog>` nativo en search/
- [ ] Feel-check: spam ⌘K no anima

## STOP conditions

- Si CommandDialog no permite ancho variable con preview → usar DialogContent custom width sin animación, no revertir a dialog nativo.
