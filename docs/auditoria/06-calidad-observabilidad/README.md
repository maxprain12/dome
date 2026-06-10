# 06 — Calidad y Observabilidad

Auditoría de testing, CI, logging y manejo de errores operacional. Fecha: 2026-06-09.

## Resumen

- **CI sin ejecución de tests**: `.github/workflows/ci.yml` corre typecheck, lint, depcruise, architecture guard y checks custom (`check:ipc-inventory`, `check:ipc-zod`, `check:tool-coverage`) — todos defensivos — pero **ningún job de tests** ni e2e. Las regresiones del harness solo se detectan post-release.
- **Logging string-based**: `console.log/error` sueltos (46 solo en `ai-tools-handler.cjs`), sin niveles, sin formato estructurado ni rotación. La observabilidad existente (Langfuse/LangSmith en `electron/core/observability.cjs`) es de tracing para dev, no de monitoring operacional.
- **Errores que no llegan al usuario**: fallos de tools/runs se loguean al main pero no siempre se muestran en la UI con contexto accionable.
- Sin `pnpm audit` ni gestión de vulnerabilidades de dependencias en CI.

## Tareas

| Tarea | Prioridad | Esfuerzo | Estado |
|-------|-----------|----------|--------|
| [T01 — Tests en CI](T01-tests-en-ci.md) | P0 | M | ✅ Implementada |
| [T02 — Logging estructurado en el main](T02-logging-estructurado.md) | P2 | M | ✅ Implementada |
| [T03 — Errores visibles para el usuario](T03-errores-visibles-usuario.md) | P2 | M | ⬜ Pendiente |
| [T04 — Auditoría continua de dependencias](T04-auditoria-dependencias.md) | P3 | S | ✅ Implementada |

> **Validación 2026-06-10**: T01 — CI ejecuta `test:security` (30 tests, 7 suites) + agent-core (39 tests) + `pnpm audit`; todo en verde en local. T02 — logger con archivo+rotación en userData/logs, masking de secretos y captura de uncaught/unhandled (4 tests). T04 — audit en CI, nota de revisión de deps escrita, `renovate.json` en la raíz y política de versión de Electron en `.claude/sops/release.md` (falta habilitar la app de Renovate en GitHub — acción del repo owner).

## Lo que ya está bien

- CI defensivo sólido: typecheck strict, ESLint, depcruise (estructura de dependencias), guard de "no Node modules en app/", inventario IPC, cobertura de tools.
- Observabilidad de tracing bien hecha: Langfuse con masking, truncado y caps de bytes (131KB/observation); LangSmith activable por env.
- Cero TODOs/FIXMEs pendientes en `electron/{agents,tools,core}` (código mantenido).
- `public/skills.json` legacy ya vaciado (sin código muerto relevante detectado).

## Orden recomendado

T01 primero (depende de que exista al menos la suite de [04/T01](../04-harness-agentes/T01-tests-agent-core.md); pueden arrancar juntas). T02 habilita T03 (los errores estructurados son los que se pueden mostrar bien).
