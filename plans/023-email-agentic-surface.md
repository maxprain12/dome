# Plan 023: Correo — superficie agentica (no cliente clásico)

> **Executor**: Dashboard híbrido (briefing + colas + detalle/compose inline). Hotfix social SQL en `source-index`. Actualizar fila en `plans/README.md` al terminar.

## Status

- **Priority**: P1
- **Effort**: L
- **Depends on**: 010 (Codex email), 004 (persistencia), 021/022 (patrones dashboard + ⌘K)
- **Category**: UI craft / surface redesign
- **Status note**: DONE (executed)

## Why

El tab Correo era un cliente IMAP clásico (carpetas · lista · reader · compose Dialog). Las acciones agenticas vivían solo en Many. Hace falta la misma reinterpretación que Seguimiento (021): qué atender, con quién, y chips hacia Many — sin rail de carpetas como eje.

## Scope

- Hotfix: `searchSocialDirect` / `indexSocialPosts` / `countSocialForProject` sin `a.project_id` (social es vault-global)
- `mailQueues` + `MailDashboard` / Stats / Row / QueueSection
- Reescribir `EmailView`: HubHeader + Popover de carpeta + master–detail `InlineDetailCard`
- Compose/respuesta inline (`MailComposePanel`); chips Many + pins `email:`
- i18n `email.agent_*`; borrar `email-view.css` BEM
- Sin schema / Himalaya protocol changes

## STOP

- No cambiar schema SQLite ni protocolo Himalaya (tampoco `project_id` en social)
- Un solo surface de detalle (nunca Dialog para leer/redactar primario)
- Sin `*V2` / aliases deprecated
- No reintroducir sidebar de carpetas como navegación principal
- No exigir LLM en el paint inicial

## Acceptance

- Consola sin `searchSocialDirect: no such column: a.project_id`
- Abrir Correo muestra briefing + colas, no un tree de carpetas
- Click mensaje → ficha derecha; Redactar/Responder en la misma columna
- “Preguntar a Many” deja el mail en contexto
- Deep-link `dome:focus-email` sigue abriendo el mensaje
- `pnpm run typecheck` OK
