# Plan 014 — Automatizaciones de integraciones

**Estado:** DONE (STOP: draft_only + matrix; sin DM live) · **Prioridad:** P1 · **Esfuerzo:** XL  
**Depende de:** 003, 012, 017

## Objetivo

Añadir triggers/acciones nativos de integraciones (comentario social con `#Curso` → DM con enlace; email/github hooks) sin romper schedule/manual/contextual actuales. Usar memoria social (016/017) para tono del DM.

## Drift check

- [`electron/agents/automation-service.cjs`](../electron/agents/automation-service.cjs) — tick schedule 60s
- [`run-engine.cjs`](../electron/agents/run-engine.cjs) — contextual via tags
- Triggers hoy: `manual` | `schedule` | `contextual`
- Targets: `many` | `agent` | `workflow` | `feeder`
- **No** hay triggers email/social/github
- Social comments/DM: verificar capabilities por provider en [`electron/social/providers/`](../electron/social/providers/)

## Diseño destino

Nuevos `trigger_type` (v1):

- `social_comment` — poll comentarios en posts monitorizados; match hashtag/keyword
- (Opcional fase 1.1) `email_received`, `github_issue_event` — documentar schema, implementar si coste bajo

Nuevas acciones (en definition `actions` o target dedicado):

- `social_dm` — enviar DM/mensaje con template + link
- `email_send` — plantilla (respeta permisos cuenta)
- Reutilizar target `many`/`agent` con prompt que incluye memoria domain

Degradación: si provider no expone DM/comments → acción `draft_only` + notificación UI; no fallar el engine.

## Implementación

1. Extender schema `automation_definitions` (JSON schedule/config) con campos `social_comment: { hashtag, postIds?, accountId, replyTemplate }`.
2. Poller en automation-service o social-scheduler: nuevos comentarios → match → enqueue run.
3. Dedup: `automation_run_links` / tabla seen comment ids.
4. Action executor: DM via provider; log run steps.
5. UI AutomationEditor: builder del trigger hashtag → DM.
6. Inyectar `domains/social.md` en prompt del run (015/016 cableado).
7. Tests: match hashtag, dedup, degrade sin DM.

## Validación

- Unit match `#Curso` case-insensitive.
- Integration mock provider.
- Typecheck, IPC si hay channels nuevos.

## Criterios de aceptación

- Regla “comentario con #Curso → DM con URL” funciona en al menos un provider soportado.
- Schedule/contextual intactos.
- Runs visibles en UI Runs.

## STOP conditions

Si ningún provider en producción tiene comments+DM, ship solo draft_only + UI monitor (012) y marcar provider matrix en docs. No simular DMs falsos.

## Mantenimiento

Provider matrix (comments/DM/scopes) en `docs/features/automations.md`. Nueva red = fila en matrix + adapter.
