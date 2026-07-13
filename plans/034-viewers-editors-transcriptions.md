# Plan 034 — Viewers, editores y transcripciones

**Estado:** DONE · **Prioridad:** P1 · **Esfuerzo:** XL  
**Commit auditado:** `b500063c` · **Depende de:** 024–028

## Objetivo

Unificar el chrome de documentos y contenido estructurado mediante un `ViewerShell` directo y pequeño, preservando los motores especializados, virtualización y formatos.

## Drift check

Inventariar viewers PDF/media/web/text, editor/notebook/notes, clientes workspace y transcripciones; registrar toolbars, outline, metadata, búsqueda, exports y librerías especializadas.

## Diseño destino

- `ViewerShell`: breadcrumb/título, toolbar, status, slot de contenido y conexión al inspector de 028.
- Contenido especializado (PDF canvas, Tiptap, Monaco/code, waveform, notebook, virtualization) permanece custom.
- Outline/metadata en inspector/`Sheet`; acciones secundarias en `DropdownMenu`.
- Transcripciones: lista `Table`/`Item`; detalle como workspace estructurado; export en dropdown.

## Implementación

1. Caracterizar abrir/cerrar, restore position, zoom, find, outline, annotations, save, export y selección temporal.
2. Definir el contrato mínimo de `ViewerShell` sin crear un mega-wrapper de variantes; usar slots explícitos y tipos exhaustivos.
3. Migrar toolbars/chrome a `ButtonGroup`, `ToggleGroup`, `DropdownMenu`, `Tooltip`, `Breadcrumb`, `Badge`, `Progress` y Hugeicons.
4. Conectar outline, relaciones, metadata y fuentes al inspector único. En mobile/estrecho renderizar el mismo contenido en Sheet.
5. Rehacer listas y detalle de transcripciones; conservar timestamps, speaker mapping, búsqueda, edición y export.
6. Preservar tablas/virtualización semántica para colecciones grandes; no reemplazar motores de render/editor.
7. Normalizar estados de carga/error/vacío y foco al abrir documentos.
8. Motion solo en chrome/overlays; scroll, waveform, PDF y selección no deben recibir transiciones decorativas.

## Validación

Fixtures por formato, renderer tests de toolbar/inspector/export, pruebas de virtualización y Playwright para PDF, editor y transcripción. Suite estándar completa.

## Criterios de aceptación

Chrome coherente sin perder función especializada; un solo inspector; transcripciones siguen editables/exportables; rendimiento de colecciones/documentos no empeora mediblemente.

## STOP conditions

No migrar Tiptap/Monaco/PDF/waveform ni cambiar formatos persistidos. Detener si una abstracción requiere condicionales específicos de cada viewer dentro del shell.

## Mantenimiento

Cada viewer nuevo implementa el contrato de slots y una matriz de capacidades; no duplica header/toolbar/inspector.
