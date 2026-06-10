# 06 — Calidad y observabilidad — Implementación y validación

**Rama:** `fix/auditoria-seguridad-p0-p2` · **Fecha:** 2026-06-09

## Resumen

| Tarea | Estado | Notas |
|-------|--------|-------|
| T01 Tests en CI | ✅ | `pnpm run test` + jobs CI |
| T02 Logging estructurado | ⚠️ Parcial | `electron/core/logger.cjs` JSON; usado en tool-dispatcher |
| T03 Errores visibles usuario | ⏳ Pendiente | |
| T04 Auditoría dependencias | ✅ | `pnpm audit --prod` en CI (continue-on-error) |

## Archivos clave

- `.github/workflows/ci.yml` — test:security, agent-core, audit, design-system
- `package.json` — `"test": "pnpm run test:security && pnpm --filter @dome/agent-core run test"`
- `electron/core/logger.cjs`

## Cómo validar

```bash
pnpm run test          # 12 tests node + 6 vitest agent-core
pnpm run typecheck
pnpm run lint
pnpm run check:design-system
pnpm audit --prod --audit-level=high
```

CI debe pasar jobs: Lint, Design system ratchet, Security unit tests, Agent-core unit tests.

## Pendiente

- T02: migrar `console.log` ad-hoc del main a `logger.*`
- T03: toast unificado para errores IPC `{ success: false }` en renderer
- Endurecer CI audit a bloqueante tras triage
