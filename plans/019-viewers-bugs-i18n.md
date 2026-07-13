# Plan 019: Viewers — PDFThumbnails bug + errores silenciosos + i18n loaders

> **Drift check**: `git diff --stat b500063c..HEAD -- app/components/viewers/ app/components/notebook/NotebookEditor.tsx app/components/editor/ResourcePickerModal.tsx`

## Status

- **Priority**: P1 | **Effort**: M | **Depends on**: 004 | **Planned at**: `b500063c`

## Why this matters

Bug real en PDFThumbnails, errores tragados en notebook/editor, loaders sin i18n en 4 viewers.

## Steps

1. **PDFThumbnails.tsx:19** — `let isMounted = true`; cleanup `() => { isMounted = false }`
2. **NotebookEditor.tsx:218-265** — toast/ErrorState on import/export fail
3. **ResourcePickerModal.tsx:67-68** — error state separado de empty
4. **i18n loaders** — PptViewer, DocxViewer, SpreadsheetViewer, ImageViewer → `t('viewer.loading_*')` en 4 idiomas
5. **NotebookEditor.tsx** — transition-all → explicit properties
6. **SpreadsheetViewer.tsx:507** — sheet-tab CSS transition fix

**Verify**: `pnpm run typecheck` exit 0; cambiar idioma → loaders traducidos

## Done criteria

- [ ] PDFThumbnails cleanup correcto
- [ ] Notebook import/export muestra error UI
- [ ] 0 loading strings hardcoded en viewers principales
