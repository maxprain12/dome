# Plan 012 — Tab Social Codex

**Estado:** DONE · **Prioridad:** P1 · **Esfuerzo:** L  
**Depende de:** 001

## Objetivo

Rediseñar Social Hub (composer, growth, library, reports) estilo Codex y dejar base UI para monitor de comentarios (consumo en 014).

## Drift check

- [`app/components/social/SocialHubView.tsx`](../app/components/social/SocialHubView.tsx) + composer, growth cards, reports
- [`electron/social/`](../electron/social/), IPC [`social.cjs`](../electron/ipc/integrations/social.cjs)
- Docs: [`docs/features/social-hub.md`](../docs/features/social-hub.md)
- Settings: [`SocialSection.tsx`](../app/components/settings/sections/SocialSection.tsx)

## Diseño destino

- HubHeader: cuentas conectadas, Crear post
- Secciones: Feed/Library | Growth | Reports
- Composer en Dialog con preview
- Growth: KPIs compactos Card + charts tokenizados
- Stub UI “Monitor” (lista comentarios) — datos reales en 014

## Implementación

1. Chrome kit 001; Tabs shadcn.
2. Normalizar empty/offline/error.
3. Charts con tokens CSS (no hex).
4. Composer Dialog accesible.
5. Panel Monitor placeholder con Empty “próximamente” o lista si API ya existe parcialmente.
6. i18n.

## Validación

- Smoke publish mock / list posts.
- Typecheck, lint.

## Criterios de aceptación

- Publicación y métricas sin regresión.
- Look alineado Codex.
- Punto de extensión claro para 014 (comentarios).

## STOP conditions

No ampliar OAuth scopes en este plan. Si comments API falta, solo placeholder.

## Mantenimiento

Providers siguen en `electron/social/providers/`; UI no habla HTTP directo.
