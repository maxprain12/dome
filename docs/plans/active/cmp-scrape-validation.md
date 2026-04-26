---
status: active
created: 2026-04-27
owner: team
domain: web
---

# Validación manual: scraping y CMPs (cookies)

Objetivo: comprobar que `webScraper.scrapeUrl` / `web:scrape` extrae el artículo o página principal y **no** el contenido del modal de cookies.

## Cómo probar

1. Arrancar la app en dev (`npm run electron:dev`) o invocar el scraper desde el flujo que use `web:scrape`.
2. Para cada URL, revisar:
   - El **texto** devuelto (`content`) no empieza solo con política de cookies / «Accept all».
   - `consentBlocked === false` cuando el sitio carga bien tras aceptar.
   - `consentStrategyUsed` incluye un id de CMP esperado (p. ej. `onetrust`, `cookiebot`) o `scoped-click`.

## URLs sugeridas (ajustar según disponibilidad regional)

| CMP / familia   | Notas |
|-----------------|--------|
| OneTrust        | Buscar sitios de medios corporativos EU/UK que muestren `#onetrust-accept-btn-handler`. |
| Cookiebot       | Sitios con diálogo `#CybotCookiebotDialog` o iframe `cookiebot.com`. |
| Usercentrics    | Sitios con `data-testid` tipo `uc-accept-all-button`. |
| Didomi          | Sitios con `#didomi-notice-agree-button`. |
| Quantcast       | Sitios con `qc-cmp2-summary-buttons-accept`. |
| TrustArc        | Sitios con `#truste-consent-button`. |
| Sourcepoint     | Sitios con `#sp-cc-accept`. |

Añade aquí 2–3 URLs concretas que uses habitualmente y marca ✅/❌ tras cada release.

## Regresión

- Página **sin** CMP: el scrape no debe retrasarse más de ~1–2 s por la fase de consentimiento (solo verificaciones rápidas).
- `duckduckgo.com/html/` y búsqueda Bing: resultados siguen apareciendo tras el manejo de cookies.
