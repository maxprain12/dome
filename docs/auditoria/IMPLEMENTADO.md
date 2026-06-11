# Auditoría Dome — Estado de implementación global

**Rama:** `fix/auditoria-seguridad-p0-p2` · **Actualizado:** 2026-06-10

## Checklist rápido de validación final

```bash
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run test          # test:security 38/38 + agent-core 39/39
pnpm run check:design-system
pnpm run check:ipc-inventory
pnpm run build
```

Smoke manual recomendado (requiere entorno gráfico; no automatizable en CI headless):

1. Arranque con sandbox (`pnpm run electron:dev`) — confirmar **sin** errores `[Provider models] minimax: ByteString`
2. Importar PPTX → thumbnails OK
3. Settings → guardar API key → SQLite muestra `enc:v1:…`; listado de modelos MiniMax OK
4. Chat/agente con `web_fetch` a URL pública OK; localhost bloqueado
5. Tema oscuro en Home
6. Ctrl/Cmd+Tab entre pestañas

## Por área

| Área | Doc detallado | Completitud |
|------|---------------|-------------|
| [01 Seguridad](01-seguridad/IMPLEMENTADO.md) | T01–T10 ✅ | 100% |
| [02 UI Visual](02-ui-visual/IMPLEMENTADO.md) | T02–T05 ✅, T01 ⏳ (multi-PR) | ~80% |
| [03 UX Componentes](03-ux-componentes/IMPLEMENTADO.md) | T04 ✅, resto ⏳ | ~20% |
| [04 Harness](04-harness-agentes/IMPLEMENTADO.md) | T01–T04 ✅, T05 ⏳ | ~80% |
| [05 Datos/Rendimiento](05-datos-rendimiento/IMPLEMENTADO.md) | T01–T02, T04 ✅, T03 ⏳ | ~75% |
| [06 Calidad/Obs](06-calidad-observabilidad/IMPLEMENTADO.md) | T01–T02, T04 ✅, T03 ⏳ | ~75% |

## Leyenda

- ✅ Implementado según criterios de aceptación
- ⚠️ Parcial — base lista, falta migración/refactor grande
- ⏳ Pendiente — no abordado en esta rama

## Siguiente PR sugerido (commits troceados)

1. **`fix/auditoria-seguridad`** — electron/core (secret-storage, csp, ipc-guard, shell-policy, url-guard), ipc handlers, PPT capture, OAuth timeouts
2. **`fix/auditoria-harness-calidad`** — tool timeout, releaseRunContext, tests security+agent-core, CI jobs, migration-backup
3. **`fix/auditoria-ui-ux`** — colores baseline, dark mode fixes, DomeTabBar a11y, globals.css paleta
4. **`docs/auditoria-estado`** — carpeta `docs/auditoria/` con estados validados

Pendiente antes de merge: smoke manual (punto 1 del checklist arriba).
