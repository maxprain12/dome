# 03 — UX y Componentes — Implementación y validación

**Rama:** `fix/auditoria-seguridad-p0-p2` · **Fecha:** 2026-06-09

## Resumen

| Tarea | Estado | Notas |
|-------|--------|-------|
| T01 Consolidar modales | ✅ | 3 fases: DomeModal base + ad-hoc + 6 Mantine → **0 `Modal` de Mantine** en `app/` |
| T02 Refactor gigantes | ✅ | 5 troceados (ChatToolCard 1.298→790, FolderTabView 1.194→565, Runs 1.895→582, Automations 1.342→790, UnifiedSidebar 2.123→933) + ManyPanel Fase A |
| T03 Accesibilidad | ✅ | `eslint-plugin-jsx-a11y` en error, 0 hallazgos; `DomeButton` exige `aria-label` cuando `iconOnly` |
| T04 Navegación teclado shell | ✅ | `DomeTabBar` con roving tabindex + flechas, Ctrl+Tab, Cmd/Ctrl+W, Cmd/Ctrl+1..9, scrollIntoView |
| T05 Unificar botones | ✅ | 6 Mantine `Button` → `DomeButton` + regla ESLint `no-restricted-imports` |
| T06 Responsive | ✅ | Suelo 800×600; sidebar cede ancho bajo 980px (`min(260px, 28vw)`, mín 200px) |

## Archivos clave

- `app/components/shell/DomeTabBar.tsx`

## Cómo validar

```bash
pnpm run electron:dev
```

1. **Modales (T01):** Escape y focus trap funcionan en todos los modales; sin `Modal` de `@mantine/core` (`grep -rn "from '@mantine/core'" app/ | grep Modal` → 0).
2. **A11y tab bar (T03/T04):** Inspeccionar pestañas → `role="tab"`, contenedor `role="tablist"`, `aria-selected` en activa.
3. **Teclado (T04):** Con 2+ pestañas abiertas, `Ctrl+Tab` / `Cmd+Tab` cambia pestaña; `Ctrl+Shift+Tab` retrocede; `Cmd/Ctrl+1..9` salta a la N; `Cmd/Ctrl+W` cierra la activa.
4. **Cerrar pestaña:** Botón X tiene `aria-label` con título de la pestaña.
5. **Botones (T05):** `grep -rn "from '@mantine/core'" app/ | grep Button` → 0.
6. **Responsive (T06):** Redimensionar a 800×600 — sidebar cede ancho y panel Many colapsa a overlay; nothing clipped.

## Pendiente menor (no-código)

- Pase visual manual a 800×600 y ~1000×700 por home, chat/Many, viewer PDF, settings, learn, canvas y runs.
- Auditoría con axe DevTools sobre las 5 vistas principales en ambos temas (T03 — los patrones que la regla estática no modela).
