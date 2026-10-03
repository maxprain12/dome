# Complementos: catálogo curado

**Decisión (2026-09-03):** el catálogo de Complementos de Dome es un **catálogo curado first-party**, no una plataforma pública de terceros.

## Por qué

- `DEFAULT_SOURCES` en `electron/marketplace/marketplace-config.cjs` está vacío a propósito.
- No hay moderación, versionado ni firma de paquetes de terceros.
- El supply real hoy son agentes, workflows y bundles empaquetados en `public/`.

## Qué se envía

Bundles instalables (export/import existente):

- Lead → ficha → follow-up
- Doc → brief → post
- Research digest semanal
- Outreach email
- Social inbox triage (agente)

Fuentes GitHub de terceros siguen siendo opt-in en Settings. No se promete ecosistema público hasta que exista supply y revisión.

## Catálogo editorial público

`app/lib/marketplace/complements-catalog.json` contiene fichas en en/es/fr/pt vinculadas a los IDs instalables. `pnpm run check:complements-catalog` verifica versiones y permisos contra los manifiestos. `node scripts/export-complements-catalog.mjs /ruta/catalog.json` exporta el JSON validado; la web hermana lo importa con su script `catalog:import`.

El catálogo público destaca Dome CMS y las plantillas de Dome. La conexión Filesystem MCP se identifica con su autor externo y exige configurar carpetas autorizadas; no implica abrir publicación de paquetes de terceros. Las fuentes personales conservan su mecanismo actual.

`dome://complements/<category>/<id>` abre una ficha para revisar, nunca instala. Categorías: plugins, agents, workflows, skills, mcp. Solo se admiten IDs simples, sin consultas, fragmentos ni comandos. La entrega pendiente usa `window:take-complement-links` para conservar enlaces recibidos antes de cargar el renderer.
