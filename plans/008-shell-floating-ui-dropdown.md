# Plan 008: Floating UI shell — DomeTabBar y folder-tab → DropdownMenu/ContextMenu

> **Drift check**: `git diff --stat b500063c..HEAD -- app/components/shell/DomeTabBar.tsx app/components/shell/folder-tab/`

## Status

- **Priority**: P1 | **Effort**: L | **Risk**: MED | **Planned at**: `b500063c`

## Why this matters

~6 implementaciones de menús con `createPortal` en shell/ (DomeTabBar overflow + context, FolderCard, FolderListRow, ColorPickerPopover). Violan CLAUDE.md: usar Popover/DropdownMenu, no portal manual.

## Current state

- `DomeTabBar.tsx:395-398` — setState en render (mover a useEffect)
- `DomeTabBar.tsx:483-795` — 3 portales ReactDOM
- `FolderCard.tsx:588-618`, `FolderListRow.tsx:234-265`, `ColorPickerPopover.tsx:50-89`
- Contraste positivo: `FolderTabView.tsx:743-882` ya usa DropdownMenu

## Scope

**In scope:** DomeTabBar.tsx, FolderCard.tsx, FolderListRow.tsx, ColorPickerPopover.tsx, FileRow.tsx, SubfolderCard.tsx, AddMenu.tsx

**Out of scope:** Mention pickers caret-anchored

## Steps

### Step 1: Fix setState en render DomeTabBar

Mover cierre overflow menu a `useEffect([hasHorizontalOverflow, overflowMenuOpen])`.

### Step 2: Overflow menu → DropdownMenu

Reemplazar portal overflow por DropdownMenu anclado al botón trigger.

### Step 3: Tab context menu → ContextMenu

Items: close, close others, pin, colors → ContextMenuContent + ContextMenuItem.

### Step 4: ColorPickerPopover → Popover

Swatches dentro de PopoverContent; mantener posicionamiento relativo al trigger de color.

### Step 5: FolderCard/FolderListRow/FileRow/SubfolderCard

Unificar menú de acciones de recurso en ContextMenu o DropdownMenu. **Validar** que no hay clipping en cards con transform — si Popover falla, documentar en PR y usar modalidad `modal={false}` de Base UI.

**Verify**: feel-check click derecho en tab y en folder card; Escape cierra; focus trap OK.

## Done criteria

- [ ] 0 `createPortal` en DomeTabBar.tsx
- [ ] ≤1 createPortal restante en folder-tab solo si clipping imposible (documentado)
- [ ] `pnpm run typecheck` exit 0

## STOP conditions

- Si DropdownMenu queda clipped en FolderCard tras 2 intentos con collisionPadding → STOP y reportar; no dejar portal sin documentar.
