# Plan 032 — Orchestration, Canvas, Automations y Runs

**Estado:** DONE · **Prioridad:** P1 · **Esfuerzo:** XL  
**Commit auditado:** `b500063c` · **Depende de:** 024–027

## Objetivo

Dar una interfaz común a la suite de automatización sin sustituir el motor gráfico del canvas. Estandarizar navegación, listados, configuración, detalle y ejecución con shadcn.

## Drift check

Inventariar rutas, tabs, canvas nodes/edges, stages, automations, runs/logs, modales, drag/drop, shortcuts e IPC. Comparar consumidores de wrappers compartidos antes de borrarlos.

## Diseño destino

- Suite con una cabecera y `Tabs` canónicas: Canvas, Automations, Runs y recursos aplicables.
- Listados con `Table`/DataTable o `Item` según densidad; filtros en toolbar.
- Detalle de run/stage en `Sheet`; creación/edición focal en `Dialog`; borrado en `AlertDialog`.
- Canvas sigue custom para nodos, edges, minimap y pan/zoom; todo su chrome usa shadcn.
- Palette con `Sidebar`/`Command`; inspector dentro del contrato único de 028.

## Implementación

1. Caracterizar creación, conexión, selección, undo/redo, guardado, run, cancelación, logs y estados del pipeline.
2. Crear shell compartido de suite y unificar registries de tabs/acciones sin alterar rutas.
3. Migrar toolbars, palette, menus de nodo y empty/error/loading a `ButtonGroup`, `ToggleGroup`, `DropdownMenu`, `ContextMenu`, `Command`, `Empty`, `Alert` y `Skeleton`.
4. Llevar propiedades del nodo/stage al inspector único; en estrecho usar `Sheet` con el mismo formulario `FieldGroup`.
5. Rehacer Automations/Runs como vistas densas semánticas con selección, filtros, badges y menú de fila. Mantener virtualización si los volúmenes lo requieren.
6. Rehacer detalle/logs con `Tabs`, `ScrollArea`, `Collapsible` y copy actions. No animar streams de logs.
7. Mantener transformaciones de canvas en compositor; eliminar `transition-all`, width/height animados y keyframes no tokenizados.

## Validación

Tests de reducers/registries, operaciones del canvas y formularios; Playwright de crear-conectar-guardar-ejecutar-cancelar; accesibilidad de menus y foco; suite estándar.

## Criterios de aceptación

El motor del canvas conserva paridad funcional; el chrome y las vistas de datos son shadcn; existe un solo inspector; runs y logs son legibles y operables por teclado.

## STOP conditions

Detener si un rediseño visual exige cambiar serialización de grafos, canales IPC o semántica de ejecución. No reemplazar librerías de canvas en este plan.

## Mantenimiento

Documentar contrato de chrome/inspector para nuevos tipos de nodo y añadir tests de compatibilidad del schema.
