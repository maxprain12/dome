# 03 — UX y Componentes — Implementación y validación

**Rama:** `fix/auditoria-seguridad-p0-p2` · **Fecha:** 2026-06-09

## Resumen

| Tarea | Estado | Notas |
|-------|--------|-------|
| T01 Consolidar modales | ⏳ Pendiente | Sin refactor masivo (L) |
| T02 Refactor gigantes | ⏳ Pendiente | UnifiedSidebar etc. intactos |
| T03 Accesibilidad | ⚠️ Parcial | Tab bar: `role="tablist"`, `role="tab"`, `aria-selected` |
| T04 Navegación teclado shell | ⚠️ Parcial | Ctrl/Cmd+Tab entre pestañas en `DomeTabBar` |
| T05 Unificar botones | ⏳ Pendiente | |
| T06 Responsive | ⏳ Pendiente | |

## Archivos clave

- `app/components/shell/DomeTabBar.tsx`

## Cómo validar

```bash
pnpm run electron:dev
```

1. **A11y tab bar:** Inspeccionar pestañas → `role="tab"`, contenedor `role="tablist"`, `aria-selected` en activa.
2. **Teclado:** Con 2+ pestañas abiertas, `Ctrl+Tab` / `Cmd+Tab` cambia pestaña; `Ctrl+Shift+Tab` retrocede.
3. **Cerrar pestaña:** Botón X tiene `aria-label` con título de la pestaña.

## Pendiente

- T01: migrar modales ad-hoc → `DomeModal` por feature
- T02: extraer subcomponentes de UnifiedSidebar, ManyPanel, etc.
- T05: grep `from '@mantine/core'` Button → `DomeButton`
- T06: audit ventana <980px en settings y viewers
