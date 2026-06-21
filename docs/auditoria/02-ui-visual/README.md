# 02 — UI Visual (design system, tema, i18n)

Auditoría de consistencia visual: cumplimiento del design system (`.claude/rules/new-color-palette.md`), tema oscuro, paleta deprecada e i18n. Fecha: 2026-06-09.

## Resumen

- **~385 hex colors hardcodeados** en `app/` fuera de las definiciones de paleta (51% de violación del design system).
- **~20 puntos rotos en dark mode** (`bg-white/90`, `text-neutral-600`, colores Tailwind arbitrarios).
- Mapeos legacy `--brand-*` duplicados en `app/globals.css:262-263` conviviendo con la paleta nueva — dos guías de diseño "activas".
- i18n excelente: ~4.428 usos de `t()`, solo ~3 strings fuera.
- No existe ninguna regla de lint que impida volver a introducir colores hardcodeados.

## Tareas

| Tarea | Prioridad | Esfuerzo | Estado |
|-------|-----------|----------|--------|
| [T01 — Migrar colores hardcodeados a variables CSS](T01-colores-hardcodeados.md) | P1 | L | ✅ Implementado |
| [T02 — Arreglar dark mode roto](T02-dark-mode-roto.md) | P1 | S | ✅ Implementada |
| [T03 — Eliminar paleta deprecada y alinear docs](T03-paleta-deprecada.md) | P2 | S | ✅ Implementada |
| [T04 — Regla de lint del design system](T04-lint-design-system.md) | P2 | S | ✅ Implementada |
| [T05 — Cobertura i18n al 100%](T05-i18n-restante.md) | P3 | S | ✅ Implementada |

> **Validación 2026-06-10**: T01–T05 implementadas (paletas centralizadas en `app/lib/ui/palettes.ts`, dark mode con variables semánticas, `--brand-*` eliminado + docs alineadas, ratchet de colores en CI, badges de estado traducidos a 4 idiomas).

## Lo que ya está bien

- i18n con react-i18next prácticamente completa (en/es/fr/pt en `app/lib/i18n.ts`).
- `--brand-primary` ya no se usa en componentes (0 usos directos).
- El tema reacciona a `data-theme` vía MutationObservers (`app/main.tsx`, `useDomeThemeSnapshot.ts`).
- Estados de carga/vacío/error centralizados y con a11y (`DomeListState.tsx` con `role="status"` + `aria-live`).

## Orden recomendado

T04 (lint) primero o en paralelo con T01/T02 — evita que el problema vuelva a crecer mientras se migra. T03 al final de la migración.
