# Marketplace: catálogo first-party

**Decisión (2026-09-03):** el Marketplace de Dome es un **catálogo curado first-party**, no una plataforma pública de terceros.

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
