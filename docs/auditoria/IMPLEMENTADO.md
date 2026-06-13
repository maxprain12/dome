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
| [02 UI Visual](02-ui-visual/IMPLEMENTADO.md) | T01–T05 ✅ | 100% |
| [03 UX Componentes](03-ux-componentes/IMPLEMENTADO.md) | T01, T03–T06 ✅, T02 🔶 (solo ManyPanel) | ~95% |
| [04 Harness](04-harness-agentes/IMPLEMENTADO.md) | T01–T05 ✅ | 100% |
| [05 Datos/Rendimiento](05-datos-rendimiento/IMPLEMENTADO.md) | T01–T04 ✅ | 100% |
| [06 Calidad/Obs](06-calidad-observabilidad/IMPLEMENTADO.md) | T01–T02, T04 ✅, T03 ✅ | 100% |

## Leyenda

- ✅ Implementado según criterios de aceptación
- ⚠️ Parcial — base lista, falta migración/refactor grande
- ⏳ Pendiente — no abordado en esta rama

## Estado final (2026-06-13)

**33/34 tareas en `main`.** Lo único pendiente (no abordable sin ejecutar la app / acción del owner):

1. **03/T02 — ManyPanel** (único componente gigante sin trocear): refactor de alto riesgo del panel de chat; requiere extraerlo con la app levantada para smoke test.
2. **Smoke tests manuales** — checklists por PR (`pnpm run electron:dev`): provider keys, modales, refactors de hub/sidebar, DB nueva/HEAD/vieja migrando.
3. **Renovate** — `renovate.json` ya en la raíz; habilitar la app en GitHub (Settings → Integrations) es acción del owner.

Detalle por PR en [README.md](README.md) § "PRs de la auditoría".
