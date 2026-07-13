# Plan 035 — Calendar y Email

**Estado:** DONE · **Prioridad:** P1 · **Esfuerzo:** XL  
**Commit auditado:** `b500063c` · **Depende de:** 024–027

## Objetivo

Reimplementar Calendar y Email como herramientas de productividad densas, minimalistas y coherentes, conservando proveedores, sincronización, stores e IPC.

## Drift check

Inventariar rutas, calendar grids/events, cuentas, carpetas, message lists, reader, composer, attachments, sync states y estilos. Validar los contratos de integración directamente contra el código antes de editar.

## Calendar destino

- Toolbar compacta con `ButtonGroup`, `ToggleGroup`, date controls y filtros.
- Grid de calendario custom por semántica y rendimiento.
- Agenda contextual en panel/inspector; evento en `Dialog`; filtros pequeños en `Popover`.
- Estados de proveedor/sync con `Badge`, `Alert`, `Skeleton` y Empty.

## Email destino

- Tres paneles `Resizable`: carpetas, lista, reader; en estrecho navegación por una sola superficie y back.
- Filas con `Item`, `Avatar`, `Badge`; reader con toolbar y `ScrollArea`.
- Compose en `Dialog` amplio con `FieldGroup`, recipients mediante `Popover + Command`, adjuntos y confirmación de descarte.

## Implementación

1. Caracterizar navegación temporal, CRUD de eventos, selección, sync y shortcuts; para email, folders, pagination, read/unread, thread, compose/reply/forward/draft/attachments.
2. Rehacer chrome de Calendar manteniendo grid y cálculo temporal actuales. No animar posición/tamaño de eventos.
3. Migrar detalle/edición de evento a Dialog accesible con foco inicial y validación.
4. Rehacer Email con `ResizablePanelGroup`, `Item`, `Table` donde aplique, toolbar y estados estándar; preservar virtualización.
5. Unificar compose/reply sobre el mismo formulario y lifecycle de draft; alerta destructiva al descartar cambios.
6. Sustituir CSS paralelo, botones/inputs crudos e iconos conceptuales por shadcn/Hugeicons.
7. Añadir breakpoints, reduced motion e i18n en en/es/fr/pt.

## Validación

Tests de adaptadores/store y formularios; Playwright de evento y flujo email mock; responsive, keyboard y suite estándar. Validar que no cambien canales ni payloads.

## Criterios de aceptación

Calendar conserva exactitud temporal y Email todos los ciclos de mensaje/draft; desktop aprovecha densidad sin paneles superpuestos; overlays siguen la matriz acordada.

## STOP conditions

Detener si hay diferencias de contrato con proveedores/backend, zonas horarias no cubiertas o drafts sin caracterización. No cambiar integración cross-repo.

## Mantenimiento

Fixtures obligatorias para timezone/DST y estados de mensaje; nuevos proveedores adaptan datos, no crean otra UI.
