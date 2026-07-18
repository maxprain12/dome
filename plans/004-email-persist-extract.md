# Plan 004 — Persistencia y extracción de email

**Estado:** DONE · **Prioridad:** P0 · **Esfuerzo:** XL  
**Depende de:** —

## Objetivo

Persistir envelopes (y bodies bajo demanda) de email en SQLite vía Himalaya, para indexación (005), menciones/contactos (003) y UI Codex (010). Hoy solo existen `email_accounts` y lectura live.

## Drift check

- [`electron/email/himalaya-service.cjs`](../electron/email/himalaya-service.cjs)
- [`electron/ipc/integrations/email.cjs`](../electron/ipc/integrations/email.cjs)
- Tabla `email_accounts` (credenciales safeStorage)
- Tools: [`packages/tools/src/domains/email/`](../packages/tools/src/domains/email/)
- UI: [`app/components/email/EmailView.tsx`](../app/components/email/EmailView.tsx)

## Datos destino

```
email_folders (id, account_id, remote_name, role?, uidvalidity?, ...)
email_messages (
  id, account_id, folder_id, uid, message_id?,
  subject, from_json, to_json, cc_json, date,
  snippet, has_attachments, flags_json,
  body_text?, body_html?, synced_at, ...
  UNIQUE(account_id, folder_id, uid)
)
email_sync_state (account_id, folder_id, last_uid, cursor, ...)
```

Política v1:

- Sync incremental de INBOX (+ Sent opcional) por cuenta.
- Bodies: lazy fetch al abrir / al indexar batch; no bajar todo el historial de golpe.
- Extracción de contactos → `person_identities` (si 003 ya merged; si no, cola de pending emails para link posterior).

## Implementación

1. Schema + migración + store (`electron/email/email-store.cjs` o similar).
2. Scheduler sync (patrón GitHub: [`github-sync-scheduler.cjs`](../electron/github/github-sync-scheduler.cjs)).
3. IPC: `email:sync:now|status`, list/read desde DB con fallback live.
4. Adaptar tools agente a preferir DB para search/list; send/reply siguen Himalaya.
5. Extracción From/To/Cc → people (003) o staging table.
6. Privacidad: no loguear bodies; respetar `user_actions` / `agent_actions` de la cuenta.

## Validación

- Test store con fixtures de envelopes.
- Sync idempotente (re-run no duplica).
- Typecheck + IPC inventory.

## Criterios de aceptación

- Tras sync, listado offline de últimos N mensajes en SQLite.
- Read body cachea en DB.
- Búsqueda local por subject/from/snippet (FTS en 005).

## STOP conditions

Si Himalaya no expone UID/UIDVALIDITY fiable en alguna config, detener y documentar limitación por provider antes de inventar IDs frágiles.

## Mantenimiento

Cualquier carpeta nueva syncable pasa por `email_sync_state`; no sync ad-hoc en UI.
