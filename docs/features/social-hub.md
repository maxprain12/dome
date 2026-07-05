# Social Hub — LinkedIn / Instagram / X

Gestión de redes sociales dentro de Dome: cuentas, composer multi-red con IA,
programación de posts, métricas de crecimiento e informes generados por IA.
Todo el estado vive en SQLite (main process); el renderer usa IPC `social:*`.

## Módulos (main process, `electron/social/`)

| Módulo | Qué hace |
| ------ | -------- |
| `social-store.cjs` | Persistencia (cuentas, posts, métricas, informes); credenciales cifradas |
| `social-service.cjs` | Orquestación: publicar, scheduler de posts programados, refresh de métricas |
| `social-oauth.cjs` | OAuth loopback en `127.0.0.1:8737` (configurable via `social:oauth:set-port`); scopes por proveedor |
| `social-insights.cjs` | Agregación de crecimiento (followers/impresiones por día) para dashboard |
| `social-calendar-bridge.cjs` | Espeja posts programados como eventos del calendario de Dome |
| `providers/linkedin.cjs` | ugcPosts (member + organization pages), follower count via `networkSizes` |
| `providers/instagram.cjs` | Instagram-Login API — **solo URLs públicas https** para media (sin upload binario) |
| `providers/x.cjs` | API v2: tweets + media upload |

IPC: `electron/ipc/integrations/social.cjs` (canales `social:*` — inventario
completo en [docs/architecture/ipc-channels.md](../architecture/ipc-channels.md)).
UI: `app/components/social/` (SocialHubView, SocialComposerModal,
SocialPostPreview, SocialGrowthCards, SocialReportsSection, SocialLibraryTree)
y ajustes en `app/components/settings/SocialSettings.tsx` + `SocialConnectWizard.tsx`.

## Esquema (migraciones 59–61)

- 59: `social_accounts`, `social_posts`, `social_metrics` + settings de proveedor.
- 60: `social_account_metrics` (series temporales por cuenta) + `social_reports`
  (informes IA con estado `generating|ready|failed`).
- 61: `social_accounts.account_kind` (`member` | `organization`) para páginas
  de empresa de LinkedIn.

## Cuentas y permisos

- **LinkedIn**: productos "Sign In with OpenID Connect" + "Share on LinkedIn";
  las páginas de empresa requieren además "Community Management API"
  (scopes `w_organization_social r_organization_social rw_organization_admin`,
  opt-in en Ajustes → Social → LinkedIn). Los tokens member duran ~60 días y
  no se refrescan en el tier estándar: al expirar la cuenta pasa a `expired`.
- **Instagram**: la API Instagram-Login no acepta subida binaria — las fotos y
  vídeos deben ser URLs públicas https (el composer avisa si hay media local).
- **X**: OAuth2 con `offline.access` (refresh token).

## Composer

Multi-red (un post → N proveedores con `groupId`), asistente de copy IA
(mejorar/acortar/hashtags/generar, con tono), formatos por red (post, article,
carousel, reel…), media desde equipo / biblioteca del vault (árbol de carpetas
con contadores) / URL pública, y programación con quick-picks. Los posts
programados los publica el scheduler de `social-service` y se reflejan en el
calendario vía `social-calendar-bridge`.

## Métricas e informes

- Por post: likes/comentarios (p. ej. LinkedIn `socialActions`).
- Por cuenta: followers (LinkedIn organization via `networkSizes`;
  el enum `edgeType` difiere entre `/v2` — `CompanyFollowedByMember` — y el
  API versionado `/rest` — `COMPANY_FOLLOWED_BY_MEMBER`; el provider prueba
  ambos).
- Informes IA (`social:reports:*`): resumen de crecimiento del periodo con el
  LLM configurado; generación manual o automática (config persistida).
