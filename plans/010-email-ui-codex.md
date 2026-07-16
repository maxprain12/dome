# Plan 010 — Tab Email Codex

**Estado:** DONE · **Prioridad:** P1 · **Esfuerzo:** L  
**Depende de:** 001, 004

## Objetivo

Rediseñar la tab Email con superficies Codex y consumir mensajes persistidos (004) en lugar de solo listas live.

## Drift check

- [`app/components/email/EmailView.tsx`](../app/components/email/EmailView.tsx) (+ EmailBody, EmailErrorNotice)
- Settings: [`EmailSection.tsx`](../app/components/settings/sections/EmailSection.tsx)
- IPC email list/read/search/send

## Diseño destino

- HubHeader: cuentas, sync status, compose
- Lista master-detail: filas HubRow / Table densa
- Detalle: lectura limpia, acciones reply/forward
- Empty: sin cuenta / syncing / inbox vacío
- Búsqueda local sobre DB (005/006 pueden deep-link aquí)

## Implementación

1. Rehacer layout con kit 001.
2. Data layer: preferir mensajes SQLite; botón “Sync now”.
3. Compose Dialog (shadcn); no overlays custom.
4. Estados error Himalaya → Alert + retry.
5. Hugeicons; i18n.
6. Wire open from palette (006) si ya existe kind email.

## Validación

- Smoke con cuenta mock / fixtures store.
- Typecheck, lint.

## Criterios de aceptación

- Lista usable offline tras sync.
- Visual alineado a Settings/GitHub Codex.
- Send/reply siguen funcionando.

## STOP conditions

Si 004 no está merged, no fingir persistencia: este plan espera 004. UI-only sobre live queda fuera de alcance.

## Mantenimiento

Nuevas carpetas IMAP = fila en folder picker + sync_state, no UI one-off.
