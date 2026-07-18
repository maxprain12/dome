# Plan 025: Social real (back + UI agentica)

> **Executor**: Campañas SQLite + workspace IPC + hub sin modo analytics exclusivo. Actualizar fila en `plans/README.md` al terminar.

## Status

- **Priority**: P0
- **Effort**: L
- **Depends on**: 024, 012
- **Category**: feature / surface + persistence
- **Status note**: DONE (executed)

## Why

La UI agentica 024 quedaba vacía o atrapada en analítica; las campañas eran solo un string. Hace falta persistencia real, sync honesto y un workspace usable.

## Scope

- Migración 69: `social_campaigns` + `campaign_id` + backfill
- IPC `social:campaigns:*` + `social:workspace`
- Tools `social_campaigns_list` / `social_campaign_create` / `social_growth`
- Hub: briefing + colas siempre visibles + analytics debajo; compose con selector de campaña

## STOP

- No inventar métricas/followers cuando el provider no las da
- Compose/detalle solo `InlineDetailCard`
- Sin `*V2`

## Acceptance

- Abrir Social → briefing + colas (nunca solo informe)
- Crear campaña → SQLite; posts asociados
- Refresh stale automático; nulls etiquetados
- typecheck + tests OK
