# Patches

Patches aplicados a dependencias mediante `bun patch`. Se aplican automáticamente en `bun install`.

## @tiptap/core

**Estado**: No hay patch aplicado actualmente.

**Evaluación (paridad Docmost)**: Docmost usa un patch en `@tiptap/core` 3.17.1 que añade limpieza de listeners `touchmove`, `touchend` y `blur` en `ResizableNodeView` (tablas/imágenes redimensionables). Dome usa `@tiptap/core` 3.19.0, que ya incluye `touchmove` en add/remove. Las versiones difieren (3.17 vs 3.19) y la estructura de líneas no coincide, por lo que el patch de Docmost no se puede aplicar directamente.

**Recomendación**: Añadir un patch adaptado para 3.19.0 solo si se detectan:
- Pérdida de foco durante resize en tablet/touch sin completar la operación
- Listeners huérfanos tras cambiar de pestaña/ventana durante resize
- Problemas de memoria en sesiones largas con muchas tablas redimensionables

Para crear el patch: `bun patch @tiptap/core`, editar `dist/index.js` y `dist/index.cjs` en los bloques de `handleMouseUp` y `handleResizeStart` (añadir removeEventListener/addEventListener para `touchend` y `blur`), luego `bun patch --commit @tiptap/core`.
