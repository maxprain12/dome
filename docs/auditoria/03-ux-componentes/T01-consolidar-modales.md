# T01 — Consolidar modales en DomeModal

**Prioridad**: P1 · **Severidad**: Alta · **Esfuerzo**: L · **Área**: UX Componentes
**Estado**: 🔶 Fase 1 implementada (2026-06-11, rama `refactor/ux-consolidar-modales`) — `DomeModal` es la única base genérica: ahora con **focus trap** (ciclo Tab/Shift+Tab), **devolución de foco al trigger**, **scroll lock** del body, `closeOnEscape`/`closeOnOverlay`, `initialFocusRef`, `headerIcon`, tamaño `xl` y animaciones unificadas (`overlay-appear`/`modal-appear`). `ConfirmDialog` y `PromptModal` reescritos como composiciones finas sobre DomeModal+DomeButton (API pública intacta, −280 líneas de overlay duplicado). `Modal.tsx` **eliminado** (su único usuario, `GenerateSourceModal`, migrado). `MetadataModal` migrado; `NoteQuickTagModal` ya usaba DomeModal. **Pendiente (fase 2, oportunista con 03/T02):** los 8 modales de feature restantes (EventModal, EmbedModal, ImagePickerModal, ResourcePickerModal, FeederApprovalModal, PluginRuntimeModal, MoveToProjectModal y los Mantine Modal de FolderTabView/FileManagerTree).

## Problema

Hay 14 implementaciones de modal con overlays, animaciones, manejo de Escape y accesibilidad distintos:

**Genéricas (duplicadas entre sí):**
- `app/components/ui/Modal.tsx` (103 líneas) — overlay fijo, `zIndex: var(--z-modal-backdrop)`
- `app/components/ui/DomeModal.tsx` (117 líneas) — portal, `className="modal-overlay"`, `aria-labelledby` ✓
- `app/components/ui/PromptModal.tsx` (193 líneas)
- `app/components/ui/ConfirmDialog.tsx` (225 líneas)

**Ad-hoc por feature:** `calendar/EventModal`, `editor/EmbedModal`, `editor/ImagePickerModal`, `editor/ResourcePickerModal`, `feeders/FeederApprovalModal`, `notes/NoteQuickTagModal`, `settings/PluginRuntimeModal`, `studio/GenerateSourceModal`, `workspace/MetadataModal`, `workspace/MoveToProjectModal`.

Consecuencias: cambiar el estilo de modal toca 14 archivos, UX inconsistente (algunos con footer, otros sin; animaciones distintas; Escape a veces no funciona), y a11y desigual.

## Qué hay que hacer

1. **Elegir `DomeModal` como única base** (ya tiene portal + aria). Extenderla a API compuesta:
   - `<DomeModal>` (open, onClose, size, closeOnEscape, closeOnOverlay)
   - `<DomeModal.Header>` / `<DomeModal.Body>` / `<DomeModal.Footer>`
   - Incorporar lo que falte: focus trap, devolución de foco al trigger al cerrar, `aria-modal="true"`, scroll lock del body.
2. **Reimplementar sobre la base** los genéricos como composiciones finas:
   - `ConfirmDialog` → wrapper de DomeModal con dos botones (mantener su API pública para no tocar a todos los llamadores de golpe).
   - `PromptModal` → wrapper con input.
   - `Modal.tsx` → deprecar: re-exportar DomeModal con la firma vieja y marcar `@deprecated`.
3. **Migrar los 10 modales de feature** uno por PR: sustituir su overlay/estructura propia por `DomeModal.*`, conservando su contenido. Empezar por los más simples (`NoteQuickTagModal`, `MetadataModal`).
4. Borrar `Modal.tsx` cuando no queden imports (`grep -rn "from.*ui/Modal'" app/`).
5. Alinear los estilos con las clases del design system (`.modal-overlay`, `.modal-content`, etc. ya definidas en CSS global).

## Criterios de aceptación

- [ ] Un solo componente base de modal en `app/components/ui/`.
- [ ] Todos los modales: cierran con Escape, atrapan el foco, devuelven el foco al cerrar, tienen `aria-modal` y título asociado.
- [ ] Animación de entrada/salida idéntica en todos.
- [ ] `Modal.tsx` eliminado o solo como alias deprecado sin usos.

## Riesgos / notas

- No hacer big-bang: la API compuesta primero, migraciones después, una feature por PR.
- Mantine también trae `Modal` — si algún sitio lo usa (`grep -rn "Modal" app/ | grep mantine`), decidir si entra en esta consolidación o se tolera para casos Mantine-internos.
