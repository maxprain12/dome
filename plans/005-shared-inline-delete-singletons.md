# Plan 005: Inline + eliminar 5 componentes shared de un solo consumidor

> **Drift check**: `git diff --stat b500063c..HEAD -- app/components/shared/WindowControls.tsx app/components/shared/DrawerLayout.tsx app/components/shared/HorizontalScrollArea.tsx app/components/shared/ActiveFilterBanner.tsx app/components/shared/EntityIcon.tsx app/components/shell/AppShell.tsx app/components/automations/RunLogView.tsx app/components/pipelines/StageConfigModal.tsx app/components/orchestration/AutomationsStudioView.tsx`

## Status

- **Priority**: P1 | **Effort**: S | **Risk**: LOW | **Planned at**: `b500063c`

## Why this matters

Cinco archivos en `shared/` tienen un único consumidor externo. No aportan reutilización; generan deuda. Regla Component Lifecycle: migrar consumidor e **borrar en el mismo PR**.

## Current state

| Archivo | Único consumidor | LOC aprox |
|---------|------------------|-----------|
| WindowControls.tsx | AppShell.tsx | ~80 |
| DrawerLayout.tsx | RunLogView.tsx | ~38 |
| HorizontalScrollArea.tsx | StageConfigModal.tsx | ~29 |
| ActiveFilterBanner.tsx | AutomationsStudioView.tsx | ~50 |
| EntityIcon.tsx | AutomationsStudioView.tsx | ~40 |

## Scope

**In scope:** 4 archivos consumidores + **DELETE** 5 archivos shared

**Out of scope:** DetailDrawer, Toolbar, etc. (múltiples consumidores)

## Steps

### Step 1: WindowControls → AppShell

Copiar cuerpo de `WindowControls` como función interna `LinuxWindowControls` en `AppShell.tsx` (o mismo archivo, export no necesario). Mantener lógica mounted/electron/macOS/Windows hide.

**DELETE** `WindowControls.tsx`

### Step 2: DrawerLayout → RunLogView

Inline el JSX de `DrawerLayout` (flex column + scroll body) directamente en RunLogView donde se usa `<DrawerLayout header={...} footer={...}>`.

**DELETE** `DrawerLayout.tsx`

### Step 3: HorizontalScrollArea → StageConfigModal

```tsx
import { useHorizontalScroll } from '@/lib/hooks/useHorizontalScroll';
const scrollRef = useRef<HTMLDivElement>(null);
useHorizontalScroll(scrollRef);
// <div ref={scrollRef} className="flex flex-nowrap gap-1 overflow-x-auto ...">
```

**DELETE** `HorizontalScrollArea.tsx`

### Step 4: ActiveFilterBanner + EntityIcon → AutomationsStudioView

Inline ambos componentes como funciones locales al final de `AutomationsStudioView.tsx` o bloques JSX directos. EntityIcon mapea `HubEntityKind` — copiar enum/tints tal cual.

**DELETE** ambos archivos.

**Verify**: `grep -rn "WindowControls\|DrawerLayout\|HorizontalScrollArea\|ActiveFilterBanner\|EntityIcon" app/ --include="*.tsx"` → solo definiciones locales si las hay, 0 imports de shared

## Done criteria

- [ ] 5 archivos eliminados de `app/components/shared/`
- [ ] 0 imports `@/components/shared/(WindowControls|DrawerLayout|HorizontalScrollArea|ActiveFilterBanner|EntityIcon)`
- [ ] AppShell window controls siguen ocultos en macOS/Windows
- [ ] StageConfigModal mantiene scroll horizontal con rueda
- [ ] `pnpm run typecheck` exit 0

## STOP conditions

- Si WindowControls se importa en más sitios tras drift → migrar todos antes de borrar.
