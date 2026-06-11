# T01 — Ejecutar tests en CI

**Prioridad**: P0 · **Severidad**: Crítica · **Esfuerzo**: M · **Área**: Calidad
**Estado**: ✅ Implementada (2026-06-10) — CI ejecuta `test:security` (**30 tests**, 7 suites: shell-policy, url-guard, migration-backup, settings-secrets, security-path, logger, tool-call-policy) y la suite vitest de agent-core (**39 tests**); `pnpm run test` raíz configurado, placebo eliminado, y además `pnpm audit --prod` como step no bloqueante. Todo en verde en local. Pendiente (fases 2-3, opcionales): tests del renderer con testing-library y smoke e2e con Playwright.

## Problema

`.github/workflows/ci.yml` no ejecuta ningún test. Los scripts `test:*` del `package.json` raíz (`test:db`, `test:feeders`, `test:web-search`) son utilidades manuales, y `packages/agent-core` tiene `"test": "echo … && exit 0"`. Todo el gate de calidad es estático (tipos, lint, estructura); el comportamiento no se verifica nunca automáticamente.

## Qué hay que hacer

1. **Estandarizar el runner**: vitest en todos los `packages/*` y para los tests de `electron/` que sean Node-puro. Script raíz `pnpm run test` = `pnpm -r --if-present test` (que cada package real tenga suite; quitar los `echo … exit 0`).
2. **Job de CI**: añadir `test` al workflow (mismo setup de pnpm/node que los jobs existentes), bloqueante para merge. Cachear como los demás jobs.
3. **Contenido inicial del gate** (mínimo viable, crece con las otras áreas):
   - Suite de `@dome/agent-core` ([04/T01](../04-harness-agentes/T01-tests-agent-core.md)).
   - Tests de migraciones DB ([05/T01](../05-datos-rendimiento/T01-migraciones-transaccionales.md)) — corren con better-sqlite3 en Node, sin Electron.
   - Funciones puras ya testeables: `topologicalLevels`, `sanitizePath`, policy de shell ([01/T06](../01-seguridad/T06-shell-exec-hardening.md)), guard de URLs ([01/T07](../01-seguridad/T07-ssrf-bloqueo-ips.md)).
4. **Renderer** (segunda fase): vitest + @testing-library/react para hooks/stores extraídos en los refactors de [03/T02](../03-ux-componentes/T02-refactor-componentes-gigantes.md). No intentar testear componentes gigantes antes de trocearlos.
5. **E2E** (tercera fase, opcional): un smoke con Playwright + electron (`_electron.launch`) que arranque la app, cree una nota y la lea — detecta roturas de empaquetado/preload que nada más detecta. Correrlo en CI solo en release branches si es lento.

## Criterios de aceptación

- [ ] `pnpm run test` ejecuta suites reales en local.
- [ ] CI tiene job de tests bloqueante y está en verde.
- [ ] Ningún package con test-script placebo (`echo … exit 0`).
- [ ] (Fase 3) smoke e2e en el pipeline de release.

## Riesgos / notas

- No bloquear esta tarea esperando cobertura perfecta: el job de CI con 30 tests útiles ya cambia la dinámica (todo lo nuevo trae tests).
- Los módulos `.cjs` de electron se pueden testear en Node mientras no toquen APIs de Electron; para los que sí, extraer la lógica pura (patrón ya usado en los refactors).
