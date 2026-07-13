# Plan 004: Refactor ListState + eliminar LoadingState y ErrorState

> **Drift check**: `git diff --stat b500063c..HEAD -- app/components/shared/ListState.tsx app/components/shared/LoadingState.tsx app/components/shared/ErrorState.tsx app/components/viewers/`

## Status

- **Priority**: P1 | **Effort**: M | **Risk**: MED | **Planned at**: `b500063c`

## Why this matters

Tres capas (`LoadingState` → `ListState`, `ErrorState` → `ListState`) duplican wrappers. `ListState` usa `Loader2`+adapter en vez de `Spinner`, empty manual en vez de `Empty`, y **ignora** prop `action` en rama error (`ErrorState.tsx:20` pasa `action` que nunca se renderiza).

## Current state

```tsx
// ListState.tsx:42-62 — loading con Loader2 lucide-adapter
<Loader2 className="animate-spin ..." />

// ListState.tsx:90-124 — empty manual, no Empty/EmptyMedia
// ListState.tsx:66-87 — error sin {action}
```

**LoadingState**: 7 viewers  
**ErrorState**: 9 sitios (viewers + ErrorBoundary)  
**ListState directo**: ~19 sitios

## Scope

**In scope:**
- Refactor `ListState.tsx`
- Migrar 7 LoadingState + 9 ErrorState consumers a `ListState` directo
- **DELETE** `LoadingState.tsx`, `ErrorState.tsx`

**Out of scope:** Rediseño visual de estados (mantener apariencia)

## Steps

### Step 1: Refactor rama loading

```tsx
import { Spinner } from '@/components/ui/spinner';

<Spinner className={cn(fullHeight ? 'size-8' : 'size-5')} />
```

Quitar import lucide-adapter Loader2.

### Step 2: Refactor rama empty

```tsx
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';

<Empty className={cn(fullHeight && 'h-full border-0')}>
  {icon && <EmptyMedia variant="icon">{icon}</EmptyMedia>}
  <EmptyHeader>
    {title && <EmptyTitle>{title}</EmptyTitle>}
    {description && <EmptyDescription>{description}</EmptyDescription>}
  </EmptyHeader>
  {action}
</Empty>
```

### Step 3: Fix rama error — renderizar `action`

Tras el botón retry, añadir `{action}` si existe.

### Step 4: Migrar consumidores LoadingState/ErrorState

Reemplazar:
- `import LoadingState from '@/components/shared/LoadingState'` → `import ListState from '@/components/shared/ListState'`
- `<LoadingState message={x} />` → `<ListState variant="loading" loadingLabel={x} fullHeight />`
- `<ErrorState error={e} onRetry={fn} />` → `<ListState variant="error" errorMessage={e} onRetry={fn} fullHeight />`

Archivos viewers: AudioPlayer, VideoPlayer, ImageViewer, DocxViewer, PptViewer, SpreadsheetViewer, URLViewer, PDFViewer (solo ErrorState), ErrorBoundary.

### Step 5: DELETE wrappers

Eliminar `LoadingState.tsx` y `ErrorState.tsx`.

**Verify**: `grep -rn "LoadingState\|ErrorState" app/ --include="*.tsx" | grep -v ListState` → 0 imports

## Done criteria

- [ ] ListState usa Spinner + Empty
- [ ] Prop `action` funciona en error
- [ ] 2 archivos wrapper eliminados
- [ ] `pnpm run typecheck && pnpm run build` exit 0

## STOP conditions

- Si Empty cambia layout de estados fullHeight de forma inaceptable → ajustar `className` en Empty, no revertir a div manual.
