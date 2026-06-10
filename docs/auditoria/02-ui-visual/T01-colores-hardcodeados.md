# T01 — Migrar colores hardcodeados a variables CSS

**Prioridad**: P1 · **Severidad**: Alta · **Esfuerzo**: L · **Área**: UI Visual
**Estado**: ✅ Implementado (2026-06-10, rama `fix/ui-migracion-colores-hardcodeados`) — ratchet en **0/0**. Paletas de contenido centralizadas en `app/lib/ui/palettes.ts` (swatches de carpetas/tags persistidos en DB, highlights del editor, nodos del canvas, fallbacks de canvas PDF, tints del marketplace) — único archivo de app con hex permitido junto a `resource-actions.ts` (hex solo en descripciones de tools). ~111 fallbacks `var(--x, #hex)` eliminados (variables ya definidas; se añadieron `--dome-on-accent`, `--dome-danger`, `--warning-text`, `--ppt-text-default` a `globals.css`). CSS de learn/notes-editor/home-dashboard migrados a variables locales con par light/dark (gradientes pastel, badges SRS, tone-chips). Pendiente de revisión visual manual en ambos temas (home, sidebar, learn, editor, canvas).

## Problema

~385 instancias de hex colors en `app/` fuera de las definiciones de paleta, más ~1.134 inline styles con colores. Cambiar la paleta hoy requiere buscar y reemplazar por todo el árbol, y produce inconsistencias entre componentes (mismo gris con 4 valores distintos).

Peores ofensores (conteo de líneas con hex):

| Archivo | Hex | Nota |
|---------|-----|------|
| `app/styles/home-dashboard.css` | ~45 | backgrounds `#fbfbfe`, `#010104`, rgba() por tema |
| `app/styles/notes-editor.css` | ~29 | |
| `app/components/workspace/UnifiedSidebar.tsx` | ~19 | paleta inline `'#596037', '#6d7a42', …'` |
| `app/components/home/FolderColorPicker.tsx` | ~16 | `FOLDER_COLOR_SWATCHES` array de 16 hex |
| `app/styles/learn.css` | ~15 | |
| `app/lib/agent-canvas/system-agents.ts` | ~12 | colores de nodos del canvas |
| `app/components/tiptap-ui/color-highlight-button/use-color-highlight.ts` | ~10 | colores de highlight (semánticos, ver notas) |

## Qué hay que hacer

1. **Clasificar antes de migrar.** No todo hex es una violación:
   - *Paletas de contenido* (swatches de carpetas, colores de highlight del editor, colores de nodos del canvas) son datos, no tema → centralizarlas en **un** módulo (`app/lib/ui/palettes.ts`) exportado y documentado, idealmente con par light/dark por entrada.
   - *Colores de tema* (fondos, textos, bordes, estados) → migrar a `var(--…)` de `app/globals.css`.
2. **CSS files** (`home-dashboard.css`, `notes-editor.css`, `learn.css`): reemplazar hex/rgba por variables existentes (`--bg`, `--bg-secondary`, `--border`, `--primary-text`…). Donde haga falta translucidez, crear variables nuevas en `globals.css` (`--overlay-weak`, `--overlay-strong`) usando `color-mix(in srgb, var(--bg) 80%, transparent)` para que respondan al tema.
3. **Inline styles en .tsx**: mismo criterio. Para Tailwind arbitrario (`bg-[#…]`, `text-blue-500` en UI de tema), usar `bg-[var(--bg-secondary)]` / clases del design system.
4. Trabajar por lotes (un dominio por PR: workspace, home, learn, tiptap-ui, agent-canvas) para que cada PR sea revisable y verificable visualmente en ambos temas.
5. Apoyarse en [T04](T04-lint-design-system.md) (regla de lint) para congelar el estado tras cada lote.

## Criterios de aceptación

- [ ] `grep -rEn "#[0-9a-fA-F]{3,8}\b" app/ --include='*.tsx' --include='*.ts'` solo devuelve resultados en `app/lib/ui/palettes.ts` (y archivos justificados).
- [ ] Los CSS de `app/styles/` no contienen hex fuera de definiciones de variables.
- [ ] Revisión visual en light y dark de: home dashboard, sidebar, learn, editor de notas, agent canvas.

## Riesgos / notas

- Esfuerzo grande pero mecánico; el riesgo es perder matices visuales — comparar screenshots antes/después por vista.
- Los swatches de carpetas están persistidos en DB como hex: la paleta centralizada debe conservar los mismos valores para no romper carpetas existentes.
