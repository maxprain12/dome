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
| Referencias | Directorio de creadores + dossier (evidencia pública, exploraciones en segundo plano). |
| Tendencias | Radar híbrido: **Tu radar** (posts + referencias), y Para ti / Emergentes / Populares cuando hay evidencia temporal y multi-autor. Creatividades visuales rankeadas por engagement real; el CTA genera ángulos, no copia el título de una referencia. |

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

## Referentes (migración 76–77)

El estudio de **Referencias** es un directorio de creadores (inspiración / competencia / siguiendo), no una lista plana de URLs. Cada fila es un miembro de `social_watchlists`. Los posts públicos capturados viven en `social_references` como evidencia del dossier.

- Pegar una URL pública resuelve el perfil, lo da de alta en la vista activa y guarda posts visibles como biblioteca.
- **Explorar ahora** encola un job en main (`social_explorations`): captura pública + resumen. Many permanece cerrado. Recetas y cadencia (manual / diario / semanal) se ajustan en el propio panel.
- Sugerencias (`social_creator_suggestions`): hashtags de tus posts, autores de comentarios ya importados y perfiles públicos guardados. Tope de 5 candidatos por red y semana. Aceptar / descartar se recuerda.
- Tendencias es otra pestaña: **radar híbrido**. **Tu radar** evoluciona el benchmark de posts y referencias. Para ti / Emergentes / Populares solo aparecen con evidencia temporal y varios autores. CTA «Crear a partir de esta tendencia». Contrato: [`docs/plans/active/social-trends-radar.md`](../plans/active/social-trends-radar.md).

IPC: `social:references:*`, `social:watchlists:*`, `social:explorations:list|run|run-theme|cancel|recipes`, `social:suggestions:list|refresh|accept|dismiss`, `social:trends:snapshot|feed|event|create-from|capabilities`.

Chips de Many: un perfil/referencia se pinea con avatar y etiqueta `@handle · Instagram`, nunca el título HTML crudo. Pulsar el chip abre la ficha del creador en Referencias.

## Campañas (migración 69)

Tabla `social_campaigns` (`id`, `name` UNIQUE, `goal`, `status` active|archived).  
`social_posts.campaign_id` + string denormalizado `campaign` para agrupar/buscar.

IPC: `social:campaigns:list|create|update|archive`.

## Workspace IPC

`social:workspace` → accounts, posts, campaigns, growth (con `followersUnavailable`), reply drafts, `metricsStale`, counts/totals (impresiones `null` si el provider no las da).

## Comentarios del inspector

Los comentarios públicos se anidan como en la red (`parentId` → hilo). En cada comentario se puede responder en público, preguntar a Many sobre ese perfil y añadir o abrir el contacto si ya está en People.

## Tools de agente

`social_accounts_list`, `social_posts_list`, `social_post_draft`, `social_post_publish` (HITL), `social_metrics_summary`, `social_growth`, `social_campaigns_list`, `social_campaign_create`, `social_public_resolve`, `social_reference_save`, `social_reference_list`, `social_watchlists_list`, `social_watchlist_add`, `social_competitive_report`, `social_trends_snapshot`, `social_campaign_from_references`.  
Skills: `dome-social-insights`, `dome-social-operations` (recommended, one-click install).

## Módulos main

`electron/social/` — store, service, insights, oauth, providers, messaging.  
Ajustes: `app/components/settings/sections/SocialSection.tsx`.

## Notas de métricas

- LinkedIn **member**: no hay followers en API estándar → `followersUnavailable: 'linkedin_member'`.
- LinkedIn **organization**: followers vía `networkSizes`.
- Impresiones a menudo `null` (no se muestran como 0 falso en el summary).

## Varias cuentas en un vault

Cuentas conserva las identidades conectadas y ofrece una entrada de conexión por
red, aunque ya existan cuentas de esa red. Cada autorización de Instagram tiene
su identidad y token: autorizar otra identidad añade una cuenta; reconectar la
misma actualiza sus credenciales conservando el id y las publicaciones asociadas.
La API usada es [Instagram Login de Meta](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api), para cuentas profesionales. Go-live (review, verificación, callback HTTPS): [instagram-meta-go-live.md](instagram-meta-go-live.md).

El compositor hereda la cuenta seleccionada en el workspace. Sin contexto solo
preselecciona un destino cuando existe una única cuenta activa de esa red.
Publicar requiere una cuenta explícita, activa y de la misma red; desconectarla
no transfiere publicaciones a otra identidad. `social_post_draft` requiere
`account_id` obtenido con `social_accounts_list`, tanto en main como en renderer.

Inicio y Bandeja respetan el filtro de cuenta. Buscar o filtrar borradores en
Contenido no cambia los KPIs de Inicio. Los informes y campañas son entidades
compartidas del vault; Insights contiene informes y el funnel de eventos, sin
superponer métricas actuales a informes históricos.

## Sincronización y límites del dashboard

La sincronización manual de una cuenta importa su feed y refresca únicamente sus
métricas. Los fallos por cuenta se muestran aunque otras cuentas se sincronicen.
El refresco periódico de métricas existente sigue funcionando; abrir Social ya
no inicia otro refresco de red desde el renderer.

El workspace utiliza un payload coherente para publicaciones, métricas y cuentas;
los eventos cercanos se agrupan en una recarga local. Se eliminó el fallback de
cinco consultas que podía mezclar estados y ocultar errores.

Los KPIs cuentan publicaciones publicadas del periodo, con métricas acumuladas
por publicación, no interacciones ocurridas durante ese periodo. Impresiones sin
datos y audiencia sin medición muestran `—`. La curva muestra seguidores y no
inventa ceros anteriores a la primera captura. No se calculan porcentajes de
crecimiento sobre una base cero ni se mezclan curvas de unidades distintas.

No se añade un autopuller: el importador actual trae hasta 25 publicaciones por
cuenta y el workspace carga hasta 200 publicaciones. No representan un histórico
completo. Antes de automatizar imports hacen falta paginación incremental,
recuperación de huecos y política de reintentos/límites. Se reutilizan los cuatro
procesos periódicos existentes (publicación, métricas, informes y comentarios).
