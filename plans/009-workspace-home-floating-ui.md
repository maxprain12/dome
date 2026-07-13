# Plan 009: Floating UI workspace + home → shadcn overlays

> **Drift check**: `git diff --stat b500063c..HEAD -- app/components/workspace/ app/components/home/ContextMenu.tsx app/components/home/FilterBar.tsx app/components/home/projects/ProjectCard.tsx`

## Status

- **Priority**: P1 | **Effort**: L | **Risk**: MED | **Planned at**: `b500063c`

## Why this matters

Workspace y home concentran portales manuales: WorkspaceHeader menu, SidebarContextMenu, AddResourceMenu, home ContextMenu, ProjectCard KB menu, FilterBar dropdown sin dismiss.

## Current state

- `WorkspaceHeader.tsx:406-435` — createPortal menu
- `SidebarContextMenu.tsx:93-123` — createPortal
- `AddResourceMenu.tsx:46-58` — fixed div
- `home/ContextMenu.tsx:36-56` — fixed manual
- `home/FilterBar.tsx:76-117` — dropdown sin click-outside/Escape
- `home/projects/ProjectCard.tsx:51-79` — createPortal KB menu
- `home/ProjectsDashboard.tsx:538-638` — dialog nativo

## Scope

**In scope:** archivos listados + ProjectsDashboard modals

**Out of scope:** FolderCard (plan 008)

## Steps

1. WorkspaceHeader more menu → DropdownMenu
2. SidebarContextMenu → ContextMenu (Base UI)
3. AddResourceMenu → DropdownMenu o Popover
4. home/ContextMenu → ContextMenu; eliminar `dark:` overrides manuales → tokens
5. FilterBar filter panel → Popover con dismiss automático
6. ProjectCard KB menu → DropdownMenu
7. ProjectsDashboard modals → Dialog + AlertDialog para destructive

**Verify**: `grep createPortal app/components/workspace/ app/components/home/` → 0 (excepto pickers caret si los hay)

## Done criteria

- [ ] Menús home/workspace usan primitivos shadcn
- [ ] FilterBar cierra con Escape y click outside
- [ ] `pnpm run build` exit 0

## STOP conditions

- ContextMenu en sidebar debe funcionar con click derecho en items del árbol — test manual obligatorio.
