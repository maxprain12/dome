# T04 — Navegación por teclado en el shell (tabs, popovers, atajos)

**Prioridad**: P2 · **Severidad**: Media · **Esfuerzo**: M · **Área**: UX Componentes
**Estado**: ✅ Implementada (2026-06-10) — `DomeTabBar.tsx`: `role="tablist"` con roving tabindex (`tabIndex={isActive ? 0 : -1}`), flechas ←/→/Home/End mueven el foco, `Ctrl+Tab`/`Ctrl+Shift+Tab` ciclan, `Cmd/Ctrl+W` cierra la tab activa (no pinned/home), `Cmd/Ctrl+1..9` salta a la tab N (9 = última), y la tab activa hace `scrollIntoView`. En Win/Linux el cierre de ventana del menú se reasignó a `Ctrl+Shift+W` para liberar `Ctrl+W` (`main.cjs`). Escape ya cerraba el menú contextual y el overflow; el overflow menu (botón "…") ya existía como indicador. Pendiente menor: verificar que los atajos no interfieren con el editor Tiptap en runtime.

## Problema

El shell de pestañas (`app/components/shell/DomeTabBar.tsx`, `AppShell.tsx`, `FolderTabView.tsx`) es usable con ratón pero limitado con teclado:

- Las tabs no tienen `role="tablist"` / `role="tab"` / `aria-selected` ni navegación con flechas.
- Popovers (p. ej. color picker en `FolderTabView.tsx:~87`) solo cierran con click fuera, no con Escape.
- No hay atajos de gestión de pestañas estilo navegador (Cmd/Ctrl+W cerrar, Cmd+T según el caso, Ctrl+Tab siguiente, Cmd+1..9 ir a tab N).
- Overflow de tabs sin indicador de scroll.

## Qué hay que hacer

1. **Semántica de tabs** en `DomeTabBar.tsx`: contenedor `role="tablist"`, cada tab `role="tab"` + `aria-selected` + `id`, panel activo `role="tabpanel"` + `aria-labelledby`. Patrón WAI-ARIA Tabs (roving tabindex: solo la tab activa con `tabIndex=0`).
2. **Flechas izquierda/derecha** mueven el foco entre tabs; Enter/Espacio activa; Home/End extremos.
3. **Atajos globales** (registrar en el shell, vía `useEffect` con keydown o el sistema de atajos existente si lo hay — buscar `addEventListener('keydown'` en `app/components/shell/`):
   - `Cmd/Ctrl+W` cierra la tab activa (si es cerrable)
   - `Ctrl+Tab` / `Ctrl+Shift+Tab` siguiente/anterior
   - `Cmd/Ctrl+1..9` ir a la tab N
   - Documentarlos en algún panel de ayuda/settings.
4. **Escape cierra popovers**: el color picker de `FolderTabView` y cualquier popover custom del shell. Devolver el foco al trigger.
5. **Overflow**: indicador de scroll (gradiente o flechas) cuando las tabs desbordan; la tab activa siempre scrolled into view (`scrollIntoView({ inline: 'nearest' })` al activarse).

## Criterios de aceptación

- [ ] Se puede cambiar de tab, cerrar tabs y abrir las vistas principales sin tocar el ratón.
- [ ] axe no reporta problemas de roles en la tab bar.
- [ ] Escape cierra todos los popovers del shell y devuelve el foco.
- [ ] Con 15+ tabs abiertas, la activa siempre es visible.

## Riesgos / notas

- Los atajos no deben dispararse cuando el foco está en un editor de texto (Tiptap captura teclas) — comprobar `event.target` / `isContentEditable`.
- En macOS Cmd+W por defecto cierra la ventana Electron: interceptarlo en el menú de la app o el `before-input-event` para que cierre la tab.
