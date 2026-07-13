# Plan 037 — Marketplace, Cloud y Plugins

**Estado:** IN PROGRESS · **Prioridad:** P1 · **Esfuerzo:** L  
**Commit auditado:** `b500063c` · **Depende de:** 024–027, 029

## Objetivo

Reimplementar descubrimiento, conexión e instalación con una experiencia coherente y segura. Conservar runtimes, manifests, permisos, sync e imports.

## Drift check

Inventariar marketplace, Cloud, plugins, runtime modals, instalación/actualización/desinstalación, permisos, import pickers y configuración relacionada. Consultar contratos actuales antes de editar.

## Diseño destino

- Marketplace: `Sidebar` de categorías/filtros, catálogo Card/Item y detalle en `Sheet`.
- Cloud: `Dialog` con `Tabs`, `Breadcrumb` y listas para explorar/importar; progreso persistente en Alert/Progress.
- Plugins: `Table` con estado, versión, permisos y row actions; detalle/config en Sheet/Dialog según tarea.

## Implementación

1. Caracterizar browse/search/install/update/remove, errores, permisos, runtime status, cloud navigation/import y cancelación.
2. Rehacer catálogo con búsqueda `Command`, filtros, badges y estados estándar; separar datos de presentación.
3. Rehacer detalle e instalación con permisos explícitos y confirmación destructiva. No ocultar publisher/source/version.
4. Rehacer Cloud picker como Dialog navegable, con path breadcrumb, selección clara, loading y retry; evitar drawers de desktop.
5. Rehacer tabla/configuración de plugins, corrigiendo cualquier setState durante render mediante effects/eventos caracterizados.
6. Integrar enlaces de Settings mediante el registry de 029, sin duplicar paneles.
7. Migrar iconos, CSS, raw controls y motion a foundations; no exponer secrets/tokens.

## Validación

Tests de state machines y permissions; Playwright con runtimes/API mock para instalar, configurar, desinstalar e importar; suite estándar y contract checks.

## Criterios de aceptación

Origen/permisos/estado siempre visibles; flujos cancelables y recuperables; Settings enlaza a una única vista; no cambian manifests, runtime IPC ni contratos cloud.

## STOP conditions

Detener si la UI actual es la única documentación de un permiso/runtime state o si contratos cloud/plugin no coinciden; documentar antes de asumir.

## Mantenimiento

Fixtures por estado/permiso y test de compatibilidad por versión de manifest.
