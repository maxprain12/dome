# Plan 003 — Modelo unificado people / identidades

**Estado:** DONE · **Prioridad:** P0 · **Esfuerzo:** XL  
**Depende de:** —

## Objetivo

Crear un modelo canónico de personas e identidades cross-source (GitHub login, email, handle social) para que `@maxprain` / `@alder` resuelvan a un contacto unificado usable por menciones, Many y búsqueda.

## Drift check

- No existe tabla `contacts`/`people` hoy.
- GitHub: `github_issues` + `github:issues:listMentionables` ([`electron/github/`](../electron/github/), [`electron/ipc/integrations/github.cjs`](../electron/ipc/integrations/github.cjs))
- Email: solo `email_accounts`; mensajes no persistidos (004)
- Social: `social_accounts` / `social_posts` ([`electron/social/`](../electron/social/))
- Grafo: `graph_nodes` type `person` — no sincronizado con integraciones
- Menciones chat/notas: solo resources ([`useResourceMention`](../app/lib/), `db:resources:searchForMention`)

## Datos destino

Tablas SQLite (y Drizzle en `packages/db` si el dominio cabe en el piloto):

```
people (
  id, project_id, display_name, primary_email?,
  avatar_url?, notes?, created_at, updated_at
)

person_identities (
  id, person_id, source,  -- 'github' | 'email' | 'social_x' | 'social_linkedin' | 'social_instagram' | 'manual'
  external_id,            -- login, email address, handle
  display_label?,
  meta_json?,             -- raw provider fields
  UNIQUE(project_id via person, source, external_id)
)
```

Resolución: lookup por `external_id` / display_name fuzzy; merge manual o por email+login coincidentes.

## Implementación

1. Migración schema + queries/repos (IPC `people:list|get|upsert|linkIdentity|search`).
2. Whitelist preload + registro IPC (`electron/ipc/...`).
3. Seed inicial desde GitHub mentionables/collaborators del repo activo del proyecto.
4. Hook post-sync GitHub: upsert identities `source=github`.
5. Tras 004: extractor de From/To/Cc → identities `source=email`.
6. Tras social: handles de comentarios/mentions cuando existan.
7. UI mínima: no hub completo; suficiente API + Settings/debug o inspector posterior. La UI de mención es 007.

## Validación

- Tests de upsert/merge/unique constraint.
- IPC inventory + typecheck.
- Fixture: dos identities → un person; search por `@login` y email.

## Criterios de aceptación

- `people:search(q)` devuelve personas con identities tipadas.
- GitHub sync rellena identities sin duplicar.
- Scoped por `project_id`.

## STOP conditions

No fusionar automáticamente identities ambiguas (mismo display_name distinto email) sin confirmación; preferir identity separada + link manual.

## Mantenimiento

Cada nueva integración que exponga “usuarios” debe escribir `person_identities`, no tablas ad-hoc de contactos.
