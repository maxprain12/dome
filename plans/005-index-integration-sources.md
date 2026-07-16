# Plan 005 — Indexar fuentes en FTS/Lance

**Estado:** DONE · **Prioridad:** P0 · **Esfuerzo:** XL  
**Depende de:** 003, 004

## Objetivo

Incluir issues GitHub, mensajes email (post-004), posts/entidades social y people en la búsqueda unificada (FTS y/o Lance), sin mezclar el modelo de `resources`.

## Drift check

- FTS: [`electron/core/db/fts-schema.cjs`](../electron/core/db/fts-schema.cjs) — `resources_fts`, `interactions_fts`
- Lance / pipeline: [`electron/services/indexing.pipeline.cjs`](../electron/services/indexing.pipeline.cjs), `shouldIndexResourceType`
- Unified search: [`electron/ipc/data/database.cjs`](../electron/ipc/data/database.cjs) `performUnifiedSearch`
- GitHub/social/email **fuera** del índice hoy

## Diseño destino

Opción cerrada v1: **FTS por dominio + fan-in en `performUnifiedSearch`**, Lance solo para resources (como ahora). Evitar forzar issues a `resources`.

```
github_issues_fts / o tabla genérica source_documents_fts
  (source, source_id, project_id, title, body, meta)

email_messages_fts
people_fts (display_name, emails, handles)
social_posts_fts
```

Resultados tipados: `{ kind: 'resource'|'issue'|'email'|'person'|'social_post', id, title, snippet, projectId }`.

Orden de indexación: **GitHub issues → people → email messages → social posts**.

## Implementación

1. Triggers FTS o rebuild jobs al sync (GitHub store, email store, social store, people upsert).
2. Extender `performUnifiedSearch` para consultar cada FTS y fusionar (RRF simple o score por dominio).
3. Caps por dominio (p.ej. top 5 cada uno) para no ahogar resources.
4. Scheduler: reindex dirty flags.
5. Tests con fixtures multi-dominio.

## Validación

- Query conocida encuentra issue por título y email por subject.
- Resources siguen apareciendo.
- `check:ipc-inventory` / typecheck.

## Criterios de aceptación

- Unified search IPC documenta `kinds` en respuesta.
- Indexación incremental tras sync GitHub/email.

## STOP conditions

No indexar bodies de email sin opt-in de cuenta (`agent_actions` / setting privacy). Detener si el usuario no ha consentido indexación de correo.

## Mantenimiento

Nuevas fuentes: registrar adapter `indexSourceDocument(kind, row)` + entrada en fan-in.
