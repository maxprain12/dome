# T02 — Arreglar dark mode roto

**Prioridad**: P1 · **Severidad**: Media · **Esfuerzo**: S · **Área**: UI Visual
**Estado**: ✅ Implementada (2026-06-10) — `ResourceCard.tsx` con `color-mix` + variables; `PluginRuntimeModal.tsx` migrado a `var(--bg)`/`var(--secondary-text)`; `text-green-500`/`text-red-500` → `var(--success)`/`var(--error)` en `DomeMcpServerSettings`, `AnnotationsTab` y `PDFPage`. Las variables semánticas (`--success/--error/--warning/--info` + `-bg`) existen en ambos temas en `globals.css`. Los `bg-white` restantes son **intencionales** (knobs de toggles sobre track coloreado; overlays de VideoPlayer/PPT sobre chrome siempre oscuro; barra de progreso del banner sobre fondo accent). Pendiente menor: pase visual manual completo en dark.

## Problema

~20 instancias de colores fijos que se rompen con `data-theme="dark"`:

| Archivo | Instancias | Ejemplo |
|---------|-----------|---------|
| `app/components/home/ResourceCard.tsx` | 4 | `bg-white/90 text-neutral-600` → fondo blanco sobre tema oscuro |
| `app/components/viewers/VideoPlayer.tsx` | 3 | |
| `app/workspace/ppt/client.tsx` | 2 | |
| `app/components/settings/PluginRuntimeModal.tsx` | 2 | |
| `app/components/home/ProjectsDashboard.tsx` | 2 | |
| `app/components/settings/DomeMcpServerSettings.tsx` | — | `text-green-500` para estados (Tailwind arbitrario) |
| `app/components/.../AnnotationsTab.tsx` | — | `text-red-500` para errores |

El tema en sí funciona (MutationObserver sobre `data-theme` en `app/main.tsx` y `useDomeThemeSnapshot.ts`); el problema son componentes que no usan variables.

## Qué hay que hacer

1. Reemplazos directos:
   - `bg-white/90` → `bg-[var(--bg-secondary)]/90` o clase con variable
   - `text-neutral-600` → `text-[var(--secondary-text)]`
   - `text-black` / `text-white` decorativos → variable correspondiente
2. **Colores semánticos** (`text-green-500`, `text-red-500`): definir variables semánticas en `globals.css` si no existen (`--success`, `--error`, `--warning`, `--info`) con valor por tema, y usar esas. Las menciona `ui-style-guidelines.md` pero hay que verificar que existan en `globals.css` con par light/dark.
3. Pase visual completo en dark: abrir cada vista principal (home, resource viewer, video, ppt workspace, settings, learn, chat) con `data-theme="dark"` y anotar/arreglar cualquier resto.
4. Comprobar contraste WCAG AA en los pares más usados (texto secundario sobre `--bg-secondary` en dark) con DevTools.

## Criterios de aceptación

- [ ] `grep -rn "bg-white\|text-neutral-\|text-black\b" app/components/` limpio o justificado.
- [ ] Variables semánticas `--success/--error/--warning/--info` definidas para ambos temas y usadas en estados.
- [ ] Pase visual en dark sin texto ilegible en las vistas principales.

## Riesgos / notas

- Tarea corta y de alto impacto percibido; buena candidata a primer PR del área.
- Coordinada con [T01](T01-colores-hardcodeados.md): si un archivo está en ambas listas, arreglarlo una sola vez.
