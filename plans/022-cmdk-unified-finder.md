# Plan 022: ⌘K — buscador unificado (no técnico)

> **Executor**: Misma filosofía que 021. Reutilizar `db:search:unified` + source-index. Actualizar fila en `plans/README.md` al terminar.

## Status

- **Priority**: P1
- **Effort**: L
- **Depends on**: 006 (palette multi-fuente), 021 (Seguimiento dashboard + inline detail)
- **Category**: UI craft / search
- **Status note**: DONE (executed)

## Why

006 abrió tabs de hub; tras 021 hace falta abrir la **ficha** (tarea / correo) y un lenguaje no técnico, con filtros por tipo.

## Scope

- Filtros find_* + copy humano + preview multi-kind
- Deep-links vía `useOpenIntentStore` + eventos `dome:focus-*`
- `DOMAIN_CAP` 12; sin schema/sync nuevos

## STOP

- No Sheet para hubs; ⌘K sigue Dialog one-shot
- Sin `*V2` / aliases deprecated
- No nuevas tablas SQLite

## Acceptance

- ⌘K busca recursos + tareas + correo + personas con filtros
- Enter en tarea → Seguimiento con detalle abierto
- Enter en correo → Email con mensaje (si hay envelope)
- `pnpm run typecheck` OK
