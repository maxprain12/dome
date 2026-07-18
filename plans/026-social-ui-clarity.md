# Plan 026: Social UI clara + master–detail (Correo/Social)

> **Executor**: P0 master–detail estable; P1 Social inbox denso. Actualizar fila en `plans/README.md` al terminar.

## Status

- **Priority**: P0
- **Effort**: M
- **Depends on**: 025
- **Category**: fix / UI
- **Status note**: DONE (executed)

## Why

Con Many oculto, el detalle/compose de Correo y Social se colapsaba (named container queries). Social además era un muro de cards vacíos y CTAs duplicados.

## Scope

- EmailView + SocialHubView: lista `flex-1` + detalle `shrink-0` con ancho viewport (`md:`), overlay en estrecho
- SocialDashboard: segmentos densos, colas vacías ocultas en Todo, menú Many, analítica contenida
- Schema guard `campaign_id` index (boot v68)

## Acceptance

- Many oculto + seleccionar correo / Nueva publicación → panel visible
- Social legible sin muro de empties
- typecheck OK
