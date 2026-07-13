# Plan 003: Eliminar FilterChipGroup — migrar a ToggleGroup shadcn

> **Drift check**: `git diff --stat b500063c..HEAD -- app/components/shared/FilterChipGroup.tsx app/components/orchestration/ app/components/marketplace/ app/components/hub/runs/RunStepBits.tsx`

## Status

- **Priority**: P1 | **Effort**: M | **Risk**: MED | **Planned at**: `b500063c`

## Why this matters

`FilterChipGroup` implementa selección única con N `<button>` manuales. shadcn `ToggleGroup type="single"` es el patrón correcto (composition.md: option sets 2–7 choices).

## Current state

- `app/components/shared/FilterChipGroup.tsx:58-87` — botones con `style` dinámico por color
- Variante `editorial` usa clases `hub-filter-chip*` en `app/styles/hub-dashboard.css:443-463`

**Consumidores (6):**
- `AgentsStudioView.tsx`, `WorkflowsStudioView.tsx`, `AutomationsStudioView.tsx`, `RunsStudioView.tsx`
- `MarketplaceView.tsx`
- `hub/runs/RunStepBits.tsx`

## Scope

**In scope:** 6 consumidores + **DELETE** `FilterChipGroup.tsx`

**Out of scope:** Filtros que no usen FilterChipGroup

## Steps

### Step 1: Migrar variante `default`

```tsx
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

<ToggleGroup type="single" value={String(value)} onValueChange={(v) => v && onChange(v as T)}>
  {options.map((opt) => (
    <ToggleGroupItem key={String(opt.value)} value={String(opt.value)} size="sm">
      {opt.label}
    </ToggleGroupItem>
  ))}
</ToggleGroup>
```

Para colores por chip (`selectedColor`), usar `className` condicional con tokens, no inline `color-mix` salvo que el diseño lo exija — preferir `data-[state=on]:bg-primary/20`.

### Step 2: Migrar variante `editorial`

Mantener clases `hub-filter-chip-group` / `hub-filter-chip-selected` en `ToggleGroupItem` via `className={cn(..., isEditorial && 'hub-filter-chip')}`.

Leer `hub-dashboard.css` antes de aplicar.

### Step 3: Actualizar 6 consumidores y borrar archivo

**Verify**: `grep -rn "FilterChipGroup" app/` → 0

## Done criteria

- [ ] 6 consumidores migrados
- [ ] `FilterChipGroup.tsx` eliminado
- [ ] Variante editorial visualmente equivalente (feel-check en Automations studio)
- [ ] `pnpm run typecheck` exit 0

## STOP conditions

- Si ToggleGroup Base UI no soporta layout vertical requerido por marketplace → usar `orientation="vertical"` o `className="flex-col"` según API de `toggle-group.tsx`; leer archivo antes de improvisar.
