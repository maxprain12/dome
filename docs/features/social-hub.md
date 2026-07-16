# Social Hub — LinkedIn / Instagram / X (workspace agentico real)

Superficie de trabajo (planes 024–025): briefing + colas + compose/detalle inline + campañas persistidas + chips Many. Estado en SQLite; renderer vía IPC `social:*`.

## Superficie UI (`app/components/social/`)

| Pieza | Rol |
| ----- | --- |
| `SocialHubView` | Carga `social:workspace`, auto-refresh métricas si stale, master–detail |
| `SocialDashboard` | Briefing, KPIs, acciones Many, colas **siempre visibles**, analítica colapsable debajo |
| `SocialComposePanel` / `SocialDetailPanel` / `SocialCampaignDetail` | `InlineDetailCard` (sin Dialog) |
| Heurísticas | [`app/lib/social/socialQueues.ts`](../../app/lib/social/socialQueues.ts) |

## Campañas (migración 69)

Tabla `social_campaigns` (`id`, `name` UNIQUE, `goal`, `status` active|archived).  
`social_posts.campaign_id` + string denormalizado `campaign` para agrupar/buscar.

IPC: `social:campaigns:list|create|update|archive`.

## Workspace IPC

`social:workspace` → accounts, posts, campaigns, growth (con `followersUnavailable`), reply drafts, `metricsStale`, counts/totals (impresiones `null` si el provider no las da).

## Tools de agente

`social_accounts_list`, `social_posts_list`, `social_post_draft`, `social_post_publish` (HITL), `social_metrics_summary`, `social_growth`, `social_campaigns_list`, `social_campaign_create`.  
Skill: `dome-social-growth`.

## Módulos main

`electron/social/` — store, service, insights, oauth, providers, messaging.  
Ajustes: `app/components/settings/sections/SocialSection.tsx`.

## Notas de métricas

- LinkedIn **member**: no hay followers en API estándar → `followersUnavailable: 'linkedin_member'`.
- LinkedIn **organization**: followers vía `networkSizes`.
- Impresiones a menudo `null` (no se muestran como 0 falso en el summary).
