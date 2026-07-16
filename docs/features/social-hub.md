# Social Hub — LinkedIn / Instagram / X (superficie agentica)

Gestión de redes en Dome reinterpretada como **superficie de trabajo** (plan 024): briefing + colas + compose/detalle inline + chips a Many. Todo el estado vive en SQLite (main); el renderer usa IPC `social:*`.

## Superficie UI (`app/components/social/`)

| Pieza | Rol |
| ----- | --- |
| `SocialHubView` | Entry: HubHeader + búsqueda + master–detail |
| `SocialDashboard` / `SocialStats` | KPIs clicables + acciones Many + colas |
| `SocialQueueSection` / `SocialPostRow` | Colas (atención, programados, borradores, campañas, recientes) |
| `SocialComposePanel` | Composer multi-red en `InlineDetailCard` (no Dialog) |
| `SocialDetailPanel` | Ficha de post + publicar / Preguntar a Many |
| `SocialGrowthCards` | Analítica secundaria (filtro Analytics) |
| `SocialReportsSection` | Informes IA (sigue disponible vía IPC; no es el eje del tab) |

Heurísticas puras: [`app/lib/social/socialQueues.ts`](../../app/lib/social/socialQueues.ts).

**Campañas**: string opcional `social_posts.campaign` agrupado en UI — sin tabla `campaigns`.

**Many**: pins `kind: 'social_post'`, skill `dome-social-growth`, prompts `social.agent_*`.

## Módulos (main process, `electron/social/`)

| Módulo | Qué hace |
| ------ | -------- |
| `social-store.cjs` | Persistencia (cuentas, posts, métricas, informes); credenciales cifradas |
| `social-service.cjs` | Orquestación: publicar, scheduler, refresh de métricas |
| `social-oauth.cjs` | OAuth loopback en `127.0.0.1:8737` |
| `social-insights.cjs` | Agregación de crecimiento |
| `social-calendar-bridge.cjs` | Posts scheduled → eventos calendario |
| `providers/{linkedin,instagram,x}.cjs` | APIs por red |

IPC: `electron/ipc/integrations/social.cjs` — inventario en [ipc-channels.md](../architecture/ipc-channels.md).  
Ajustes: `app/components/settings/sections/SocialSection.tsx`.

## Tools de agente

`social_accounts_list`, `social_posts_list`, `social_metrics_summary`, `social_post_draft`, `social_post_publish` (HITL). Skill: `electron/skills/bundled/dome-social-growth/SKILL.md`.

## Esquema (migraciones 59–61)

- `social_accounts`, `social_posts` (+ `campaign` string), `social_metrics`
- `social_account_metrics`, `social_reports`
- Sin entidad campaigns separada
