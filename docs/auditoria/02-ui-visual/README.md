# 02 — UI Visual (design system, tema, i18n)

Auditoría de consistencia visual: cumplimiento del design system (`.claude/rules/new-color-palette.md`), tema oscuro, paleta deprecada e i18n. Fecha: 2026-06-09.

## Resumen

- **0 hex hardcodeados** fuera de allowlist (`pnpm run check:design-system`).
- i18n: claves en `packages/i18n/locales/{en,es,fr,pt}/`; paridad con `pnpm run check:i18n-keys`.
- Existe lint de design system y contratos UI (`check:ui-contracts`).

## Tareas

| Tarea | Prioridad | Esfuerzo | Estado |
|-------|-----------|----------|--------|
| [T01 — Migrar colores hardcodeados a variables CSS](T01-colores-hardcodeados.md) | P1 | L | ✅ Gate en cero (CI) |
| [T02 — Arreglar dark mode roto](T02-dark-mode-roto.md) | P1 | S | ✅ Implementada |
| [T03 — Eliminar paleta deprecada y alinear docs](T03-paleta-deprecada.md) | P2 | S | ✅ Implementada |
| [T04 — Regla de lint del design system](T04-lint-design-system.md) | P2 | S | ✅ Implementada |
| [T05 — Cobertura i18n al 100%](T05-i18n-restante.md) | P3 | S | ✅ Implementada |

> **Validación 2026-06-10**: T02–T05 implementadas (dark mode con variables semánticas, `--brand-*` eliminado + docs alineadas, ratchet de colores en CI, badges de estado traducidos a 4 idiomas). Solo queda T01 — la migración por lotes de los 279 hex del baseline.

## Lo que ya está bien

- i18n con react-i18next (`packages/i18n/locales`).
- El tema reacciona a `data-theme` vía MutationObservers (`app/main.tsx`, `useDomeThemeSnapshot.ts`).
- Estados de carga/vacío/error centralizados y con a11y (`ListState` con `role="status"` + `aria-live`).

## Orden recomendado

T04 (lint) primero o en paralelo con T01/T02 — evita que el problema vuelva a crecer mientras se migra. T03 al final de la migración.
