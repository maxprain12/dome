# Plan 033 — Rediseño integral de Learn

**Estado:** DONE · **Prioridad:** P1 · **Esfuerzo:** L  
**Commit auditado:** `b500063c` · **Depende de:** 024–026

## Objetivo

Eliminar el sistema paralelo `lr-*` y reimplementar biblioteca, decks, edición y sesión de estudio con shadcn, conservando progreso, scheduling, formatos y persistencia.

## Drift check

Inventariar `app/components/learn/**`, `learn.css`, dialogs, modos de estudio, shortcuts, stores e IPC. Capturar fixtures de cada tipo de tarjeta y estado.

## Diseño destino

- Biblioteca: `PageHeader`, toolbar, `Item`/`Card`, filtros y Empty.
- Deck: overview con `Tabs` Resumen/Tarjetas/Actividad.
- Crear/editar: `Dialog` + `FieldGroup`; eliminar: `AlertDialog`.
- Estudio: superficie fullscreen enfocada, progreso discreto, respuesta/reveal y controles de teclado; sin sidebar decorativa.

## Implementación

1. Añadir tests de biblioteca, CRUD, scheduling/review, reveal, rating, progreso y shortcuts.
2. Rehacer navegación y estados con componentes shadcn y Hugeicons; usar `Badge`, `Progress`, `ToggleGroup`, `DropdownMenu`, `Empty`, `Skeleton` y `Alert`.
3. Migrar formularios/dialogs y validaciones sin modificar modelos.
4. Diseñar sesión de estudio como máquina de estados de presentación sobre el store actual; foco visible y botones con labels explícitos.
5. Sustituir todas las clases `lr-*` por Tailwind/tokens; borrar `learn.css` solo cuando `rg` confirme cero consumidores.
6. Motion: reveal con opacity/transform 200ms, progreso sin interpolación de layout, feedback no bloqueante; reduced motion instantáneo.
7. Completar i18n en cuatro idiomas.

## Validación

Tests de scheduling y UI; Playwright de crear deck, añadir tarjeta y completar review; teclado/reduced motion; suite estándar.

## Criterios de aceptación

Cero clases `lr-*`; paridad de tipos de tarjeta/progreso; edición y sesión completamente accesibles; ningún dato de aprendizaje cambia de forma.

## STOP conditions

No tocar algoritmo de scheduling ni schema/IPC. Detener si una UI legacy contiene un modo de estudio no inventariado.

## Mantenimiento

Nuevos modos deben registrarse en un union exhaustivo y reutilizar el shell de sesión.
