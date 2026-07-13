# Implementation Plans — Auditoría shadcn + animaciones Dome

Generado por las skills `/improve` + `/improve-animations` el 2026-07-13.  
**Commit de referencia:** `b500063c`

Ejecutar en el orden de la tabla salvo que las dependencias indiquen lo contrario. Cada executor: leer el plan completo, honrar STOP conditions, actualizar la fila de estado al terminar.

## Tabla de veredictos `app/components/shared/` (21 archivos)

| Archivo | Veredicto | Consumidores | Acción | Plan |
|---------|-----------|--------------|--------|------|
| SearchField | **A** | 4 | Migrar a `InputGroup` + borrar | 002 |
| FilterChipGroup | **A** | 6 | Migrar a `ToggleGroup` + borrar | 003 |
| ListState | **A** | 19 ext. | Refactor a `Empty`/`Spinner`/`Alert` | 004 |
| LoadingState | **A** | 7 | Borrar tras 004; consumidores → `ListState`/`Spinner` | 004 |
| ErrorState | **A** | 9 | Borrar tras 004; consumidores → `ListState` | 004 |
| WindowControls | **C** | 1 (`AppShell`) | Inline + borrar | 005 |
| DrawerLayout | **C** | 1 (`RunLogView`) | Inline + borrar | 005 |
| HorizontalScrollArea | **C** | 1 (`StageConfigModal`) | Inline hook + borrar | 005 |
| ActiveFilterBanner | **C** | 1 (`AutomationsStudioView`) | Inline + borrar | 005 |
| EntityIcon | **C** | 1 (`AutomationsStudioView`) | Inline + borrar | 005 |
| ConfirmDialog | **B** | 5 | Mantener; iconos Hugeicons | 006 |
| CollapsibleRow | **B** | 2 | Mantener; tokens motion | 006 |
| DetailDrawer | **B** | 5 | Mantener | — |
| ThemeProvider | **B** | 1 | Mantener | — |
| SubpageHeader | **B** | 17 | Mantener; `Button` ghost | 006 |
| SubpageFooter | **B** | 2 | Mantener; quitar border inline | 006 |
| DatePicker | **B** | 4 | Mantener | — |
| DateTimePicker | **B** | 2 | Mantener | — |
| PromptModal | **B** | 1 | Mantener | — |
| ResourceIcon | **B** | 13+ | Mantener | — |
| Toolbar | **B** | 2 | Mantener | — |

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 001 | Tokens de motion en globals.css | P1 | M | — | DONE |
| 002 | Eliminar SearchField → InputGroup | P1 | S | — | DONE |
| 003 | Eliminar FilterChipGroup → ToggleGroup | P1 | M | — | DONE |
| 004 | Refactor ListState + borrar LoadingState/ErrorState | P1 | M | — | DONE |
| 005 | Inline + borrar 5 shared de un solo consumidor | P1 | S | — | DONE |
| 006 | Pulir composiciones B en shared/ | P2 | S | — | DONE |
| 007 | Motion tokens en primitivos ui/ | P1 | M | 001 | DONE |
| 008 | Floating UI shell (DomeTabBar, folder-tab) | P1 | L | — | DONE |
| 009 | Floating UI workspace + home | P1 | L | — | DONE |
| 010 | Chat: MessageScroller + Bubble unificado | P1 | L | 004 | DONE |
| 011 | Chat: styling + Empty + Switch | P2 | S | 010 | DONE |
| 012 | Settings: bugs + ModelSelector + confirms | P1 | M | — | DONE |
| 013 | Settings: i18n cadenas hardcodeadas | P2 | M | — | DONE |
| 014 | Search: CommandPalette → Command+Dialog | P1 | L | 001,007 | DONE |
| 015 | Learn: modales lr-* → Dialog + Empty | P1 | L | 004 | DONE |
| 016 | Learn + global: motion anti-patterns | P2 | M | 001 | DONE |
| 017 | Many: panel width + cursor overlay motion | P2 | M | 001 | DONE |
| 018 | Agent-canvas: FieldGroup + Empty | P2 | M | — | DONE |
| 019 | Viewers: bugs + i18n loaders | P1 | M | 004 | DONE |
| 020 | Misc overlays (email, cloud, user, transcription) | P1 | M | 008 | DONE |
| 021 | GitHub/pipelines/studio shadcn batch | P2 | L | — | DONE |
| 022 | Icons: dead code + lucide-adapter roadmap | P3 | S | — | DONE |
| 023 | Reduced-motion: global + component-level | P2 | M | 001,007 | DONE |
| 024 | Baseline de caracterización UI | P0 | L | — | DONE |
| 025 | Foundations shadcn + sistema de motion | P0 | XL | 024 | DONE |
| 026 | Contrato Hugeicons nativo | P0 | XL | 024 | IN PROGRESS |
| 027 | Shell seguro y navegación | P0 | XL | 024–026 | DONE |
| 028 | Workspace + inspector contextual único | P0 | XL | 024–027 | DONE |
| 029 | Settings: nueva arquitectura de información | P0 | XL | 024–027 | DONE |
| 030 | Home, Projects y Search | P1 | L | 024–027 | DONE |
| 031 | Chat, Many, agentes y equipos | P0 | XL | 024–028 | DONE |
| 032 | Orchestration, Canvas, Automations y Runs | P1 | XL | 024–027 | DONE |
| 033 | Learn | P1 | L | 024–026 | DONE |
| 034 | Viewers, editores y transcripciones | P1 | XL | 024–028 | DONE |
| 035 | Calendar y Email | P1 | XL | 024–027 | DONE |
| 036 | Social, GitHub y Pipelines | P1 | XL | 024–027 | IN PROGRESS |
| 037 | Marketplace, Cloud y Plugins | P1 | L | 024–027,029 | IN PROGRESS |
| 038 | Retirar UI legacy y enforcement | P0 final | L | 025–037 | IN PROGRESS |

## Dependency notes

- **007** requiere **001** (tokens `--ease-out`, `--ease-in-out`, `--duration-*` definidos antes de referenciarlos en `ui/`).
- **010** beneficia de **004** (estados empty/loading unificados en chat).
- **014** depende de motion tokens (**001**, **007**) para CommandDialog sin animación en ⌘K.
- **015**, **019** usan `Empty`/`Spinner` estandarizados en **004**.
- **016**, **017**, **023** consumen tokens de **001**.
- **020** reutiliza patrones de **008**/**009** (DropdownMenu/Popover).
- **024** precede todo rediseño: congela contratos visuales y funcionales que no pueden inferirse después de borrar UI legacy.
- **025** y **026** pueden ejecutarse en paralelo después de **024**; fijan primitivas, motion e iconos antes de tocar dominios.
- **027** es el corte arquitectónico: el resto consume su shell y no crea navegación lateral propia.
- **028** debe preceder dominios que aportan contexto documental o conversacional al inspector.
- **029** conserva ids/aliases legacy antes de reagrupar Settings; **037** enlaza plugins/cloud a ese registry.
- **030–037** pueden repartirse por dominio una vez estabilizadas sus dependencias, pero cada executor debe preservar stores, IPC y formatos existentes.
- **038** es exclusivamente cierre: no se ejecuta parcialmente ni antes de aceptar todos los dominios.

## Arquitectura visual objetivo (segunda ola)

```text
Safe titlebar
├─ window controls
├─ closeable work tabs
└─ Command · transcription · Many toggle

App body
├─ left sidebar: project · permanent places · workspace tree · account/settings
├─ center: contextual header · toolbar · active surface
├─ contextual inspector: details · relations · sources · outputs
└─ right sidebar: Many
```

- **Sidebar = lugar permanente. Tab = trabajo transitorio cerrable.**
- Solo hay dos sidebars de app: navegación izquierda y Many derecha.
- El inspector no es una tercera sidebar: es contexto de la selección, `Resizable` en desktop y `Sheet` en estrecho.
- “Puramente shadcn” significa composiciones directas de shadcn/Base UI y tokens del preset. No significa sustituir motores especializados de canvas, PDF, editor, waveform o virtualización.
- “No heredar” aplica a presentación, jerarquía y CSS; stores, IPC, schemas, deep links, shortcuts y contratos funcionales se conservan.

## Matriz obligatoria de overlays

| Necesidad | Primitiva |
|---|---|
| Crear/editar una tarea focal | `Dialog` |
| Confirmar una acción destructiva | `AlertDialog` |
| Inspeccionar detalle secundario | `Sheet` |
| Variante narrow/touch de un panel | `Drawer` |
| Selector pequeño anclado | `Popover` |
| Menú de acciones | `DropdownMenu` |
| Acción por click derecho | `ContextMenu` |
| Búsqueda/paleta | `Command` |
| Explicación breve | `Tooltip` / `HoverCard` |
| Región persistente ajustable | `Resizable` |
| Estado persistente que requiere atención | `Alert` |
| Confirmación efímera | Sonner |

## Findings considered and rejected

### Follow-up roadmap

- La migración antes propuesta como P3 se eleva a contrato de la segunda ola: **026** migra los consumidores a Hugeicons nativo y **038** elimina el adapter solo cuando llegue a cero.

- **FolderCard createPortal**: documentado como workaround por `container-type` + `transform`; migrar a DropdownMenu requiere validar clipping — incluido en 008, no como hallazgo separado.
- **MentionTextarea createPortal**: excepción válida (picker anclado al caret); solo migrar Textarea/i18n, no eliminar portal.
- **HorizontalScrollArea → ScrollArea**: rechazado — el valor está en `useHorizontalScroll` (wheel-pan), no en el primitivo ScrollArea.
- **ConfirmDialog → AlertDialog raw**: ya compone AlertDialog correctamente; mantener como B.
- **DetailDrawer → Drawer raw**: ya compone Drawer; mantener como B.
- **tiptap-icons/**: fuera de alcance (SVG wrappers sin motion/UI patterns).
- **Mega-wrapper `DomeModal`/`UniversalHub`**: rechazado; oculta la semántica de Base UI y vuelve a introducir una capa visual heredada.
- **Drawer como panel de escritorio**: rechazado; se reserva para narrow/touch. Desktop usa Sheet para detalle temporal o Resizable para regiones persistentes.
- **Reescribir motores especializados**: rechazado; canvas, Tiptap/Monaco, PDF, waveform y virtualización mantienen sus internals y solo migran chrome/overlays.

## Hallazgos generales consolidados (top leverage)

| # | Finding | Category | Impact | Effort | Plan |
|---|---------|----------|--------|--------|------|
| 1 | ~15 sitios `createPortal` para menús anclados a elemento | shadcn/tech-debt | Inconsistente, a11y rota | L | 008,009,020 |
| 2 | `transition-all` en ~40+ archivos | motion/perf | Repaints GPU | M | 001,016 |
| 3 | Cero `prefers-reduced-motion` local en features | a11y | Usuarios vestibulares | M | 023 |
| 4 | SettingsPanel fade 500ms en cada navegación | motion | Latencia percibida | S | 012 |
| 5 | PluginRuntimeModal setState en render | correctness | Warnings React | S | 012 |
| 6 | MCPSettingsPanel estado indexado por posición | correctness | Test status incorrecto | M | 012 |
| 7 | Chat dual layout legacy/shadcn | tech-debt | Doble mantenimiento | L | 010 |
| 8 | search/ stack UI paralelo sin shadcn | shadcn | ⌘K fuera del DS | L | 014 |
| 9 | learn/ modales `<dialog class="lr-modal">` | shadcn | DS paralelo | L | 015 |
| 10 | PDFThumbnails isMounted bug | correctness | setState post-unmount | S | 019 |
