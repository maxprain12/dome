# Radar híbrido de tendencias sociales

Contrato versionado del radar de Tendencias. Desktop personaliza; Dome Provider
adquiere señales externas presupuestadas. Las acciones personales no salen del dispositivo.

## Superficie

- Pestaña Social → **Tendencias**: `[Para ti] [Emergentes] [Populares] [Tu radar]`.
- **Tu radar** evoluciona el benchmark actual (posts propios + referencias). No es tendencia global.
- **Para ti / Emergentes / Populares** solo se rellenan con evidencia temporal y multi-autor.

## Scores

| Señal | Rol |
| ----- | --- |
| `TrendScore` | Evidencia de que ocurre (relativo, velocity, burst, breadth, calidad, frescura). |
| `Affinity` | Encaje local (rendimiento propio, watchlists, tendencias usadas, intereses, decay). |
| `ForYouScore` | `TrendScore × (0.6 + 0.4×Affinity) × Novelty × Feasibility`. |
| MMR | Diversidad post-ranking (λ = 0.7). |

Fases: `emerging | accelerating | peak | cooling`. Confianza 0–1 a partir de muestra, serie y autores.

## Persistencia local (privada)

Tablas `localOnly` (no Domain Sync):

- `social_reference_metrics` — snapshots append-only de métricas de referencias.
- `social_radar_cluster_cache` — clusters/evidencia cacheados.
- `social_interest_profile` — pesos de afinidad por tema.
- `social_trend_events` — funnel first-party (`impression`, `open`, `save`, `dismiss`, `generate`, `publish`, `post_performance`).
- `social_trend_attributions` — tendencia → borrador/post.

`social_metrics` sigue siendo la serie de contenido propio. No se duplican `social_posts` / `social_references`.

## Cloud (Dome Provider)

- Observaciones normalizadas, ledger de fetch, budgets y clusters compartidos.
- Fuente inicial: X Trends + Recent Search con precios y topes configurables.
- Instagram Hashtag Search: PoC con feature flag (`social_trends_instagram_poc`).
- LinkedIn: own/org data, sin descubrimiento global.

Contrato de lectura: `GET /api/v1/social/trends` (auth + `social_cloud`, cacheable). Query: `topics`, `lang`, `market`.

## Degradación

Sin sesión, sin `social_cloud` o con presupuesto agotado: **Tu radar** sigue funcionando. Los otros feeds muestran el estado (offline, presupuesto, evidencia insuficiente, permisos).

## Rollout

1. Tu radar mejorado.
2. Sensor X para cohort interna con presupuesto.
3. Instagram PoC tras App Review.
4. Personalización avanzada.

## IPC

- `social:trends:snapshot` — payload completo (legacy + feeds).
- `social:trends:feed` — un feed concreto.
- `social:trends:event` — log de funnel local.
- `social:trends:create-from` — semilla de compositor + atribución.
- `social:trends:capabilities` — X / IG / LinkedIn + presupuesto.

## Feature flags

- `social_trends_cloud` (settings, default on si hay `social_cloud`).
- `social_trends_instagram_poc` (settings / env, default off).
