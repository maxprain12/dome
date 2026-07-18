# Plan 021: Seguimiento — dashboard único (no técnico)

> **Executor**: Una sola vista dashboard + `InlineDetailCard`. No reabrir 011/020 como parche. Actualizar fila en `plans/README.md` al terminar.

## Status

- **Priority**: P1
- **Effort**: L
- **Depends on**: 020 (inline detail pattern)
- **Category**: UI craft / surface redesign
- **Status note**: DONE (executed)

## Why

Minimal/Developer + Kanban/Gantt/Branches sobrecargan a un usuario no técnico. Kanban se rompe con listas enormes. Hace falta un dashboard llano: métricas, crear tarea, lista por objetivos, detalle a la derecha.

## Scope

- `TrackingDashboard` + stats + secciones paginadas + QuickCreate
- `GitHubView` sin modos/tabs; master–detail con `InlineDetailCard`
- Copy humano (`github.dash_*`); borrar Minimal/Kanban/Gantt/sort CSS
- Sin cambios de sync, OAuth ni schema

## STOP

- No cambiar sync, OAuth ni schema SQLite
- Un solo surface de detalle (nunca Sheet + columna)
- Sin `*V2` / aliases deprecated
- No reintroducir Kanban como vista principal

## Acceptance

- Una sola vista al abrir Seguimiento
- Dashboard con métricas + lista por objetivos + crear tarea
- Secciones densas paginadas; click → ficha derecha
- Lenguaje no técnico (ES por defecto)
- `pnpm run typecheck` OK
