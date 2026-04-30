# Señales de búsqueda (local)

Contrato mínimo para futuros rerankers (p. ej. LTR estilo SearchMO) y recomendaciones en la app.

## Eventos

| Señal | Cuándo | Campos |
|-------|--------|--------|
| `search_result_selected` (PostHog) | Usuario elige un resultado en Cmd+K o búsqueda inline del inicio | `surface`, `query_len`, `rank`, `category` |
| Buffer `sessionStorage` `dome:search:selection-buffer-v1` | Mismo momento | Entradas recientes (máx. 50): `surface`, `query`, `selectedId`, `rank1Indexed`, `category?` |

## Rank

`rank1Indexed` es la posición **1-based** en la lista **visible** para esa consulta (orden tras fusión híbrida en recursos). Sirve para pesos tipo IPW (sesgo de posición) si más adelante se entrena un modelo.

## Privacidad

No se envía el texto completo de la consulta a PostHog; solo `query_len`. El buffer de sesión guarda el query truncado (500 caracteres) solo en el dispositivo.

## Consumo futuro

- Rerank offline: exportar buffer + logs de índice.
- Recomendaciones: frecuencia de `selectedId` por proyecto como señal de “popularidad” local.
