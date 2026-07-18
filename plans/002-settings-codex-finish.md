# Plan 002 — Terminar Settings Codex

**Estado:** DONE · **Prioridad:** P0 · **Esfuerzo:** L  
**Depende de:** 001

## Objetivo

Cerrar el WIP de Settings Codex: shell, registry de 7 grupos, secciones lazy, búsqueda en rail, deep links y docs al día. Sin residuales (`SettingsLayout`, paneles `*Settings.tsx` muertos).

## Drift check

- [`app/components/settings/SettingsShell.tsx`](../app/components/settings/SettingsShell.tsx)
- [`app/components/settings/registry.tsx`](../app/components/settings/registry.tsx) + [`registry.test.ts`](../app/components/settings/registry.test.ts)
- [`app/components/settings/blocks.tsx`](../app/components/settings/blocks.tsx)
- [`app/components/settings/sections/*.tsx`](../app/components/settings/sections/)
- [`app/pages/SettingsPage.tsx`](../app/pages/SettingsPage.tsx)
- [`docs/features/settings.md`](../docs/features/settings.md) — hoy obsoleto (habla de SettingsLayout)
- Buscar imports rotos a archivos borrados (`SettingsPanel`, `settingsNavConfig`, etc.)

## Diseño destino

Siete grupos (Account → Appearance/Language → AI → Integrations → Automation/extensions → Data/privacy → System). Registry única fuente de verdad: `id`, `group`, `titleKey`, `keywords`, `icon`, lazy component, `legacyAliases`.

UX Codex: rail estrecho, search-in-rail (Enter → primer match), columna `max-w-2xl`, filas Surface/Group/Row del kit 001.

## Implementación

1. Completar secciones incompletas o inconsistentes con el kit 001 (espaciado, Field/Switch/Select shadcn).
2. Garantizar deep links: `?section=`, IPC `settings:navigate-to-section`, evento `dome:goto-settings-section`, aliases (`transcription` → `ai`).
3. Alinear Agent Context tab con planes 015–016 (lectura de ficheros martin; no implementar packs aquí, solo UI lista).
4. Actualizar [`docs/features/settings.md`](../docs/features/settings.md) al registry + SettingsShell.
5. Eliminar cualquier residual / re-export deprecated.
6. i18n en/es/fr/pt para claves nuevas del shell.

## Validación

- `registry.test.ts` pasa (ids, aliases, unicidad).
- Typecheck, lint, build.
- Smoke: abrir cada grupo desde rail y desde búsqueda.

## Criterios de aceptación

- Cero referencias a layout legacy.
- Docs coinciden con código.
- Responsive: Select móvil para índice si aplica.

## STOP conditions

No renombrar claves persistidas ni channels IPC sin migración. Detener si un section id legacy no tiene alias inequívoco.

## Mantenimiento

Check de unicidad de ids/aliases; todo setting nuevo exige registry + i18n + test.
