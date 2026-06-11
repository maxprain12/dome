# T10 — Updater (skip-version con expiración) y auditoría de dependencias

**Prioridad**: P3 · **Severidad**: Baja · **Esfuerzo**: S · **Área**: Seguridad
**Estado**: ✅ Implementada (2026-06-10) — punto 1: skip con expiración (`SKIP_EXPIRY_MS` 7 días + `skippedAt` en `update-service.cjs:30-61`); punto 2: step `pnpm audit --prod --audit-level=high` en CI (`continue-on-error: true` durante triage); punto 3: nota de revisión de pyodide/pptx-preview/linkedom escrita en [06/T04](../06-calidad-observabilidad/T04-auditoria-dependencias.md). Pendiente menor: activar Renovate/Dependabot (requiere config del repo en GitHub).

## Problema

1. **Updater**: `electron/core/update-service.cjs:38-44` — `skipVersion()` guarda la versión saltada sin expiración. Si un release contiene un parche de seguridad, el usuario que lo saltó no vuelve a ver el aviso nunca.
2. **Dependencias**: no hay `pnpm audit` en CI. Deps que conviene vigilar específicamente: `pyodide@^0.29.0` (runtime WASM), `pptx-preview@^1.0.7` (parser de formato complejo, poco mantenido), `linkedom@^0.18.12` (DOM en Node, posible sink XSS al procesar HTML scrapeado).

## Qué hay que hacer

1. **Skip con expiración** (`update-service.cjs`):
   - Guardar `skippedAt: Date.now()` junto a `skippedVersion`.
   - Al comprobar updates, ignorar el skip si han pasado >7 días o si la versión disponible es **mayor** que la saltada (ya debería ser así; verificar la comparación).
2. **Audit en CI** (`.github/workflows/ci.yml`):
   - Job `pnpm audit --prod --audit-level=high` (permitir fallo blando al principio: `continue-on-error: true` + reporte, endurecer después).
   - Opcional: Dependabot/Renovate para PRs automáticos de seguridad.
3. **Revisión puntual de las 3 deps señaladas**: versión actual vs upstream, issues de seguridad abiertos, y si `linkedom` procesa HTML no confiable, confirmar que la salida nunca se inyecta como HTML en el renderer sin sanitizar (revisar `electron/feeders/html-content-extractor.cjs` y dónde se consume).

## Criterios de aceptación

- [ ] Saltar una versión y adelantar el reloj/forzar check → el aviso reaparece tras la expiración.
- [ ] CI ejecuta `pnpm audit` y publica el resultado.
- [ ] Nota escrita (en este archivo o en docs/) del estado de pyodide/pptx-preview/linkedom.

## Riesgos / notas

- `pnpm audit` da falsos positivos en devDependencies; usar `--prod` y triagear antes de hacer el job bloqueante.
