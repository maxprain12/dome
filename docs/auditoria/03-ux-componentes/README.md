# 03 — UX y Componentes

Auditoría de consistencia de componentes, accesibilidad, navegación del shell y responsive. Fecha: 2026-06-09.

## Resumen

- **14 implementaciones distintas de modal** (4 genéricas en `app/components/ui/` + 10 ad-hoc por feature).
- **6 componentes de más de 1.100 líneas** (el mayor: `UnifiedSidebar.tsx` con 2.140) — difíciles de mantener, testear y con re-renders costosos.
- Accesibilidad parcial (~60-70%): 886 usos de `aria-*` pero icon-buttons sin label, divs clicables sin role, tabs sin `role="tablist"`.
- Mezcla de Mantine `Button` y `DomeButton` para lo mismo.
- Responsive moderado: paneles colapsan bien en <980px, pero hay anchos fijos problemáticos y la app no está validada en ventanas pequeñas.

## Tareas

| Tarea | Prioridad | Esfuerzo | Estado |
|-------|-----------|----------|--------|
| [T01 — Consolidar modales en DomeModal](T01-consolidar-modales.md) | P1 | L | ✅ Implementado |
| [T02 — Refactor de componentes gigantes](T02-refactor-componentes-gigantes.md) | P1 | L | ✅ Implementado |
| [T03 — Accesibilidad (aria, roles, focus)](T03-accesibilidad.md) | P2 | M | ✅ Implementado |
| [T04 — Navegación por teclado en el shell](T04-navegacion-teclado-shell.md) | P2 | M | ✅ Implementada |
| [T05 — Unificar botones (Mantine → DomeButton)](T05-unificar-botones.md) | P2 | M | ✅ Implementado |
| [T06 — Responsive y ventanas pequeñas](T06-responsive.md) | P3 | M | ✅ Implementado |

> **Validación 2026-06-10**: T01 implementada en 3 fases (DomeModal base + ad-hoc + los 6 Mantine → 0 `Modal` de Mantine). T02 — 5 gigantes troceados (ChatToolCard, FolderTabView, RunsWorkspaceView, AutomationsWorkspaceView, UnifiedSidebar) + ManyPanel Fase A. T03 — `eslint-plugin-jsx-a11y` en error, 0 hallazgos. T04 — tablist WAI-ARIA con roving tabindex y flechas, Ctrl+Tab, Cmd/Ctrl+W (cierra tab), Cmd/Ctrl+1..9. T05 — 6 Mantine `Button` → `DomeButton` + regla ESLint. T06 — suelo 800×600, sidebar cede ancho bajo 980px.

## Lo que ya está bien

- Estados de carga/vacío/error centralizados: `DomeListState.tsx` (variant loading/empty/error, `role="status"`, `aria-live="polite"`), `EmptyState` y variantes especializadas.
- `DomeButton.tsx` existe como botón unificado con loading state.
- `DomeModal.tsx` ya usa portal + `aria-labelledby` — buena base para la consolidación.
- Spinners consistentes (`Loader2` + `animate-spin` + `motion-reduce:animate-none`).
- 96 media queries en CSS; el panel derecho colapsa a absolute con `min(380px, 86vw)` en <980px.
- Dropdowns de tiptap sobre Radix UI primitives (patrón correcto).

## Orden recomendado

T01 y T02 son los de mayor impacto pero largos; trocearlos por componente/feature. T03/T04 pueden avanzar en paralelo (tocan atributos, no estructura). T05 es mecánica. T06 al final.
