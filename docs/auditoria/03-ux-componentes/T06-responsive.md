# T06 — Responsive y ventanas pequeñas

**Prioridad**: P3 · **Severidad**: Baja · **Esfuerzo**: M · **Área**: UX Componentes

## Problema

Dome es una app de escritorio, pero los usuarios redimensionan: media ventana en un portátil de 13" (~700×800 efectivos) debe ser usable. Estado actual:

- 96 media queries en CSS ✓ y el panel derecho colapsa bien en <980px (`width: min(380px, 86vw)` en `globals.css`).
- Pero hay anchos/altos fijos repartidos: ~40 `h-[44px]`, ~32 `min-w-[44px]`, `max-w-[200px]`, valores en px en `timeline.css`, etc.
- No hay una definición de breakpoints propia del proyecto ni un tamaño mínimo de ventana validado.

## Qué hay que hacer

1. **Definir el contrato**: tamaño mínimo soportado de ventana (propuesta: 800×600). Fijarlo en `BrowserWindow` (`minWidth`/`minHeight` en `electron/core/window-manager.cjs`) para que el SO no permita romper el layout.
2. **Pase de prueba** a 800×600 y ~1000×700 por las vistas principales: home, chat/Many (con panel lateral), resource viewer (PDF), settings, learn, agent canvas, runs. Anotar todo lo que desborde, solape o quede inaccesible.
3. **Arreglos típicos**:
   - Sidebars: colapsables o auto-colapsadas bajo un ancho umbral (verificar si `DomeSidebar` ya lo hace).
   - Tablas/headers de hub (Runs, Automations): columnas que colapsan u ocultan secundarias.
   - Sustituir anchos fijos problemáticos por `min()/clamp()`.
4. **Documentar breakpoints** del proyecto en `.claude/rules/ui-style-guidelines.md` (qué significa cada umbral en una app de escritorio: panel colapsa, sidebar colapsa, etc.) y usarlos consistentemente.

## Criterios de aceptación

- [ ] La ventana no puede hacerse más pequeña que el mínimo definido.
- [ ] A tamaño mínimo: ninguna vista principal con contenido inaccesible ni overflow horizontal del shell.
- [ ] Breakpoints documentados.

## Riesgos / notas

- No perseguir "mobile-first": es Electron; el objetivo es robustez entre 800px y pantallas grandes, no teléfonos.
