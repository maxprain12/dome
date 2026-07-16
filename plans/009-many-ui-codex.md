# Plan 009 — Many UI Codex

**Estado:** DONE · **Prioridad:** P1 · **Esfuerzo:** L  
**Depende de:** 001

## Objetivo

Cerrar el WIP de Many (composer / conversation / panel) con look Codex: island composer, header limpio, historial/context, welcome; sin residuales ni nombres versionados.

## Drift check

- [`ManyPanel.tsx`](../app/components/many/ManyPanel.tsx)
- [`panel/`](../app/components/many/panel/), [`conversation/`](../app/components/many/conversation/), [`composer/`](../app/components/many/composer/)
- Shell: [`TitleBar.tsx`](../app/components/shell/TitleBar.tsx), lazy many en AppShell
- Docs viejos: `docs/auditoria/.../ManyPanel-plan.md` (nombres obsoletos)
- i18n: [`packages/i18n/locales/*/many.json`](../packages/i18n/locales/en/many.json)

## Diseño destino

- Header: tabs chat | history | context; acciones mínimas
- Conversation: turns limpios, notices, approval gate
- Composer island: `rounded-2xl border bg-card shadow-sm` (ya parcialmente)
- Welcome + composer variant welcome
- Historial fullscreen: aside coherente con Hub surfaces (001)

## Implementación

1. Alinear spacing/typography con kit 001.
2. Eliminar CSS/archivos residuales del refactor (si quedan imports rotos).
3. Unificar empty/loading con Empty/Spinner shadcn.
4. Asegurar pickers `@/#/` usan Popover/DropdownMenu (no portal manual).
5. i18n gaps en/es/fr/pt.
6. Motion: reduced-motion respetado en overlay cursor.

## Validación

- Typecheck, lint, UI contracts (`scripts/check-ui-contracts.mjs` si aplica).
- Smoke: open Many, send, history, context.

## Criterios de aceptación

- Estructura de carpetas estable; cero `Many*V2` / deprecated re-exports.
- Composer island consistente en chat y welcome.

## STOP conditions

No cambiar el runtime de runs ni IPC de chat en este plan (solo UI). Detener si un cambio de layout rompe HITL inline.

## Mantenimiento

Nuevas vistas Many viven bajo `panel/` | `conversation/` | `composer/` únicamente.
