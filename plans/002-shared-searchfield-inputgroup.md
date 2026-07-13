# Plan 002: Eliminar SearchField — migrar a InputGroup shadcn

> **Drift check**: `git diff --stat b500063c..HEAD -- app/components/shared/SearchField.tsx app/components/orchestration/ app/components/marketplace/MarketplaceView.tsx`

## Status

- **Priority**: P1 | **Effort**: S | **Risk**: LOW | **Depends on**: none
- **Planned at**: `b500063c`, 2026-07-13

## Why this matters

`SearchField` duplica un patrón que shadcn ya resuelve con `InputGroup`. Usa `<input>` crudo e inline styles. 4 consumidores; eliminar reduce deuda.

## Current state

```tsx
// app/components/shared/SearchField.tsx:23-35 — input crudo + border inline
<div style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
  <Search ... />
  <input type="search" ... />
</div>
```

**Consumidores** (grep `@/components/shared/SearchField`):
- `app/components/orchestration/AgentsStudioView.tsx`
- `app/components/orchestration/WorkflowsStudioView.tsx`
- `app/components/orchestration/AutomationsStudioView.tsx`
- `app/components/marketplace/MarketplaceView.tsx`

**Exemplar**: `app/components/ui/input-group.tsx` — `InputGroup`, `InputGroupAddon`, `InputGroupInput`

## Scope

**In scope:** 4 consumidores + **DELETE** `app/components/shared/SearchField.tsx`

**Out of scope:** Otros campos de búsqueda en home/settings que no importen SearchField

## Steps

### Step 1: Crear helper local o inline en cada consumidor

Reemplazar `<SearchField value={...} onChange={...} placeholder={...} />` por:

```tsx
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { SearchIcon } from '@hugeicons/core-free-icons'; // o icono del preset hugeicons del proyecto
import { HugeiconsIcon } from '@hugeicons/react';

<InputGroup className="max-w-xl h-8">
  <InputGroupAddon>
    <HugeiconsIcon icon={SearchIcon} aria-hidden />
  </InputGroupAddon>
  <InputGroupInput
    type="search"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    aria-label={ariaLabel ?? placeholder}
  />
</InputGroup>
```

Usar iconos **Hugeicons** (preset del proyecto), no lucide-adapter.

### Step 2: Migrar los 4 consumidores

Actualizar imports y JSX en cada archivo listado.

**Verify**: `grep -rn "shared/SearchField" app/` → 0 matches

### Step 3: Borrar SearchField.tsx

**DELETE** `app/components/shared/SearchField.tsx`

**Verify**: `pnpm run typecheck && pnpm run lint` → exit 0

## Done criteria

- [ ] `grep -rn "SearchField" app/` → 0 (salvo si queda en comentarios — no debe)
- [ ] Archivo `SearchField.tsx` eliminado
- [ ] 4 consumidores usan InputGroup
- [ ] `pnpm run build` exit 0

## STOP conditions

- Si un consumidor pasa props no soportadas por InputGroup (p.ej. `className` especial) → preservar con `className` en InputGroup, no recrear wrapper.
