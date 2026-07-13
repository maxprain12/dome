# Plan 038 — Retirar UI legacy y hacer cumplir el nuevo sistema

**Estado:** IN PROGRESS · **Prioridad:** P0 final · **Esfuerzo:** L  
**Commit auditado:** `b500063c` · **Depende de:** 025–037

## Objetivo

Cerrar la migración: eliminar capas visuales heredadas, adaptadores conceptuales Lucide y dependencias sin uso; impedir que vuelvan mediante lint/checks. Este plan se ejecuta solo cuando todos los dominios anteriores estén aceptados.

## Drift check

Repetir inventario completo con `rg`: imports del adapter Lucide, `@tabler/icons-react`, SVG/buttons/inputs/dialogs crudos, `transition-all`, clases legacy, createPortal visual, wrappers Dome, paneles laterales y componentes muertos. Comparar con los baselines de 024–026.

## Implementación

1. Confirmar que 027–037 están DONE y que sus pruebas de caracterización/producto pasan.
2. Eliminar `lucide-adapter` únicamente con cero consumidores y cero contratos `LucideIcon`; retirar `@tabler/icons-react` si el package graph confirma cero usos.
3. Borrar `HomeSidebar`, CSS `lr-*`, shells/paneles/modales/search/chat duplicados y wrappers sin consumidores. Usar `rg` y dependency graph antes de cada borrado.
4. Auditar raw HTML: permitir solo elementos semánticos o requeridos por motores especializados, con comentario/allowlist. Todo control de app usa shadcn/Base UI.
5. Auditar overlays contra la matriz: Dialog focal, AlertDialog destructivo, Sheet detalle, Drawer solo narrow/touch, Popover selector pequeño, Dropdown acciones, Command búsqueda, Resizable persistente, Alert persistente y Sonner efímero.
6. Eliminar `transition-all`, animaciones de width/height/top/left y keyframes duplicados; aplicar tokens y reduced motion. Conservar feedback de drag/canvas especializado.
7. Añadir checks CI para imports prohibidos, icon contracts legacy, clases legacy, raw dialog y nuevas sidebars/paneles fuera de registries. Mantener allowlist pequeña y documentada.
8. Actualizar arquitectura, SOP shadcn, screenshots/tours y docs de navegación/Settings.
9. Ejecutar auditorías de bundle, accesibilidad y screenshots desktop/estrecho/light/dark; corregir solo regresiones dentro del sistema nuevo.

## Comandos mínimos de auditoría

```bash
rg "lucide-adapter|LucideIcon|@tabler/icons-react" app package.json pnpm-lock.yaml
rg "transition-all|lr-|DomeModal|HomeSidebar" app
rg "<(button|input|select|textarea|dialog)\\b" app
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run check:ipc-inventory
pnpm run depcruise
```

## Criterios de aceptación

- Cero imports/contratos Lucide y dependencia Tabler sin uso eliminada.
- Cero UI visual legacy no incluida explícitamente en allowlist.
- Solo dos sidebars de app y un inspector contextual.
- Suite, arquitectura, IPC inventory y dependency graph verdes.
- Light/dark, teclado, lectores de pantalla y reduced motion verificados.

## STOP conditions

No borrar SVG de contenido, iconos internos requeridos por Tiptap, canvas/viewer engines, portales anclados al caret ni lógica IPC/store. Detener ante cualquier consumidor dinámico no trazable.

## Mantenimiento

Los checks CI, el registry de Settings, el registry del inspector y la taxonomía del shell son parte del contrato arquitectónico; cualquier excepción nueva requiere documentación y test.
