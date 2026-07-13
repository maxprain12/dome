# Plan 030 — Home, Projects y Search

**Estado:** DONE · **Prioridad:** P1 · **Esfuerzo:** L  
**Commit auditado:** `b500063c` · **Depende de:** 024–027

## Objetivo

Crear una entrada minimalista y coherente para Home/Projects, y un único lenguaje de búsqueda global/contextual basado en shadcn.

## Drift check

Releer componentes Home, Projects, Search, command palette, stores y rutas. Enumerar create/edit/delete, filtros, shortcuts y tipos de resultado antes de editar.

## Diseño destino

- Home: cabecera clara, proyectos recientes, actividad/continuar trabajo y acciones principales; no dashboard de cards decorativas.
- Projects: vista lista/grid con `ToggleGroup`, búsqueda/filtros, `Card`/`Item`, Dialog de crear/editar y AlertDialog de eliminar.
- Search: modelo de resultado compartido. Global = `Dialog + Command`; contextual = `Popover + Command`.

## Implementación

1. Caracterizar CRUD, proyecto activo, recents, filtros, shortcut ⌘K y navegación de resultados.
2. Rehacer Home y Projects con `PageHeader`, `PageToolbar`, `Card`, `Item`, `Badge`, `Avatar`, `Tabs`/`ToggleGroup`, `DropdownMenu` y estados estándar Empty/Skeleton/Alert.
3. Centralizar formularios de proyecto con `FieldGroup` y validación existente. Crear/editar en `Dialog`; borrar en `AlertDialog` con nombre explícito.
4. Definir un discriminated union de resultados y adaptadores desde proveedores existentes; no mezclar renderizado con fetch.
5. Rehacer command global y selectores contextuales con `Command`, headings de grupo, iconos Hugeicons, shortcuts y aria labels.
6. Mantener Command Palette sin animación de entrada; el resto usa tokens del plan 025.
7. Eliminar CSS/UI paralela de estas secciones tras confirmar cero consumidores.

## Validación

Tests de CRUD, filtros, estados y búsqueda por teclado; Playwright para crear proyecto, abrir resultado global y responsive. Ejecutar la suite estándar del repo.

## Criterios de aceptación

No hay dos implementaciones de command/search; cada acción destructiva confirma; Home permite retomar trabajo en uno o dos clics; todos los resultados y proyectos son navegables por teclado.

## STOP conditions

Detener ante diferencias entre ids de resultados y rutas/deep links reales; resolver con código actual, no con la auditoría.

## Mantenimiento

Todo proveedor nuevo implementa el modelo compartido y tests de ranking/navegación; no crea otra paleta.
