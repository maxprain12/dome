# Plan 028 — Workspace con inspector contextual único

**Estado:** DONE · **Prioridad:** P0 · **Esfuerzo:** XL  
**Commit auditado:** `b500063c` · **Depende de:** 024–027

## Objetivo

Reimplementar el workspace como árbol + contenido + un único inspector contextual. Eliminar la superposición visual entre SourcesPanel, SidePanel y StudioPanel sin perder sus datos o acciones.

## Drift check

Revisar HEAD/status y buscar consumidores de `WorkspaceLayout`, `WorkspaceHeader`, `SourcesPanel`, `SidePanel`, `StudioPanel`, `SidebarFileTree`, viewers y stores de selección/panel. Si los contratos difieren del commit auditado, actualizar el inventario.

## Diseño destino

- Árbol del proyecto dentro de la sidebar izquierda de 027.
- Superficie central con `Breadcrumb`, `PageHeader`, toolbar contextual y contenido especializado.
- Inspector único con `Tabs`: **Detalles, Relaciones, Fuentes, Salidas**; solo mostrar tabs aplicables.
- Desktop: panel `Resizable`; viewport estrecho: `Sheet side="right"` con el mismo view-model.
- Many permanece independiente y no aloja metadatos del documento.

## Alcance

`app/components/workspace/**`, paneles Sources/Side/Studio, file tree, cabecera/toolbar, integración de viewers/editor y estilos asociados. No reescribir el motor de cada viewer.

## Implementación

1. Caracterizar selección de archivo, expansión del árbol, restauración de anchuras, panel activo, navegación back/forward y acciones de toolbar.
2. Extraer un view-model tipado de inspector que traduzca los stores existentes a tabs y acciones; evitar duplicar estado en React local.
3. Componer layout con `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle`, `ScrollArea`, `Breadcrumb`, `Tabs`, `Separator` y `Sheet` responsive.
4. Migrar Sources/Side/Studio a contenido del inspector, manteniendo carga, errores, relaciones y acciones. No montar simultáneamente variantes ocultas.
5. Rehacer el árbol con `SidebarMenu`, `Collapsible`, `ContextMenu`, `DropdownMenu` y `Tooltip`; preservar virtualización si existe.
6. Definir un contrato `ViewerShell` mínimo para título, breadcrumbs, toolbar, status y slot de contenido; los viewers especializados permanecen internamente custom.
7. Sustituir CSS de anchuras/posicionamiento y botones crudos por tokens y primitivas shadcn; animar transform/opacity, no layout continuo.
8. Añadir gestión de foco: selección lleva foco a contenido; abrir inspector enfoca su heading; cerrar devuelve foco al trigger.

## Validación

Tests de layout/store, selección y tabs de inspector; Playwright en desktop/estrecho; snapshots accesibles de estados vacío/carga/error. Ejecutar typecheck, lint, build, IPC inventory y depcruise.

## Hecho cuando

- Nunca se renderiza más de un inspector contextual.
- Fuentes, relaciones, detalles y salidas conservan funcionalidad.
- El centro tiene el máximo espacio disponible; Sheet y panel comparten contenido y estado.
- No hay regresiones en viewers, árbol, menú contextual o proyecto activo.

## STOP conditions

Detener si la fusión requiere cambiar esquemas de datos/IPC o si dos paneles representan acciones incompatibles no modeladas; documentar el conflicto antes de inventar una semántica.

## Mantenimiento

Registrar nuevos módulos del inspector en un único registry tipado; prohibir paneles laterales ad hoc fuera de shell/workspace.
