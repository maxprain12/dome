# T07 — Bloqueo SSRF a IPs locales y metadata en web fetch

**Prioridad**: P2 · **Severidad**: Media · **Esfuerzo**: S · **Área**: Seguridad
**Estado**: ✅ Implementada (verificada 2026-06-10) — nuevo `electron/services/web/url-guard.cjs` aplicado en `fetch-dispatcher.cjs` y los providers jina-reader, readability-fetch y tavily-extract. Tests `url-guard.test.mjs` en verde. Pendiente menor: confirmar re-validación en redirects.

## Problema

`electron/services/web/fetch-dispatcher.cjs` (y el web-scraper de `electron/feeders/`) acepta URLs arbitrarias — incluidas las que pide un agente LLM con la tool `web_fetch`. No hay bloqueo de:

- `http://127.0.0.1:*` / `http://localhost:*` — servicios locales del usuario (bases de datos, paneles dev, el propio Ollama)
- `http://169.254.169.254` — endpoints de metadata cloud
- Rangos privados `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`

Un prompt injection en contenido web puede hacer que el agente lea servicios internos y exfiltre el resultado en la conversación.

## Qué hay que hacer

1. Crear `electron/services/web/url-guard.cjs` con `assertPublicUrl(url)`:
   - Solo `http:`/`https:`.
   - Resolver el hostname con `dns.promises.lookup(host, { all: true })` y rechazar si **alguna** IP resuelta es loopback, link-local (`169.254.0.0/16`, `fe80::/10`), privada o `::1`/`0.0.0.0`. Usar `net.isIP` + comprobación de rangos (o la dep `ipaddr.js` si ya está en el árbol).
   - Rechazar literales IP privadas directamente sin DNS.
2. Aplicarlo en todos los puntos de fetch iniciados por agentes/feeders: `fetch-dispatcher.cjs`, `electron/feeders/web-scraper.cjs`, `html-content-extractor.cjs`, y la tool `web-fetch` (`app/lib/ai/tools/` → handler en `electron/tools/`).
3. Excepción explícita y única para Ollama local: las llamadas a Ollama van por `electron/ollama/ollama-service.cjs` con su propia config, no por el fetch genérico — verificar que no comparten ruta.
4. Cuidado con redirects: aplicar el guard también a cada hop (usar `redirect: 'manual'` o re-validar la URL final).
5. Tests unitarios del guard: localhost, 127.1, decimal-encoded IPs (`http://2130706433`), `169.254.169.254`, dominio que resuelve a privada (mock de dns), redirect a privada.

## Criterios de aceptación

- [ ] `web_fetch` de un agente hacia `http://127.0.0.1:11434` o `http://169.254.169.254` devuelve error de URL bloqueada.
- [ ] Redirect de URL pública → privada queda bloqueado.
- [ ] El scraping y los feeders normales (sitios públicos) siguen funcionando.
- [ ] Tests del guard pasan en CI.

## Riesgos / notas

- DNS rebinding completo requeriría fijar la IP resuelta para la conexión; documentarlo como limitación conocida si no se implementa.
- Si algún usuario usa feeders contra servicios de su LAN intencionadamente, considerar una opción de settings "permitir hosts privados" desactivada por defecto.
