# Social Hub — LinkedIn / Instagram / X

Social en Dome es un **estudio de red**: la red es el sujeto (Instagram, LinkedIn, X o todas), Inicio es un canvas de rendimiento, y el resto de pestañas son el trabajo editorial (contenido, campañas, eventos) o los informes escritos.

## Esencia

Tomada de un dashboard de analytics (resumen de rendimiento, crecimiento de audiencia, mix de interacción, posts recientes), traducida a tokens Dome (tinta / papel, sin mint ni acentos de marca ajena):

| Pieza | Rol |
| ----- | --- |
| Título de red | La cuenta seleccionada nombra la página (`Instagram`), nunca un id opaco. Sin filtro: `Todas las redes`. |
| Inicio | Canvas: KPIs con tendencia, serie de audiencia, mix likes/comentarios/compartidos, tira de posts recientes. |
| Contenido / Campañas / Eventos / Cuentas | Directorio ~36% + ficha inline (misma chrome que Contactos). |
| Insights | Informes IA + funnel de eventos. El dato vivo vive en Inicio. |

Periodo (7 / 30 / 90 días) en el resumen de rendimiento. Un post reciente abre Contenido con esa ficha.

## Superficie UI (`app/components/social/`)

| Pieza | Rol |
| ----- | --- |
| `SocialHubView` | Carga el workspace y monta `SocialWorkspaceShell`. |
| `SocialOverviewDashboard` | Inicio: canvas de rendimiento. |
| `SocialStudioNav` | Título de red + filtro de cuenta + tabs. |
| `SocialDirectoryColumn` | Lista maestra de las secciones editoriales. |
| Sync feed | `social:posts:sync` importa posts ya publicados en IG / X / LinkedIn org (`created_by=import`). |
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
