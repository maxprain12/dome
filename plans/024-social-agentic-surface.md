# Plan 024: Social — superficie agentica (crecer / contenido / campañas)

> **Executor**: Dashboard híbrido (briefing + colas + compose/detalle inline). Campañas suaves vía `social_posts.campaign`. Actualizar fila en `plans/README.md` al terminar.

## Status

- **Priority**: P1
- **Effort**: L
- **Depends on**: 012 (Social Codex), 016 (domain memory), 023 (patrón agentico)
- **Category**: UI craft / surface redesign
- **Status note**: DONE (executed)

## Why

El tab Social era un hub de 5 tabs (dashboard / posts / analytics / reports / monitor). Las acciones agenticas vivían solo en Many + Dialog composer. Hace falta la misma reinterpretación que Correo (023): qué publicar, qué campaña empujar, y chips hacia Many — sin tabs como eje.

## Scope

- `socialQueues` + `SocialDashboard` / Stats / Row / QueueSection / Detail / ComposePanel
- Reescribir `SocialHubView`: HubHeader + master–detail `InlineDetailCard`
- Composer inline (sustituye `SocialComposerModal` Dialog); chips Many + pins `social_post` + skill `dome-social-growth`
- Campañas = agrupación por string `campaign` (sin schema nuevo)
- i18n `social.agent_*`; docs `social-hub.md`

## STOP

- No tabla `campaigns` / migración SQLite
- Un solo surface de detalle (nunca Dialog para compose/detalle primario)
- Sin `*V2` / aliases deprecated
- No exigir LLM en el paint inicial
- Reutilizar IPC `social:*` y tools `social_*`

## Acceptance

- Abrir Social muestra briefing + colas, no 5 tabs
- Nuevo post / editar → ficha derecha; “Preguntar a Many” deja contexto
- Campañas visibles por string; crear campaña no exige migración
- `pnpm run typecheck` OK; tests `socialQueues`
