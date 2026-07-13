# Plan 027 — Reimplementar el shell seguro y la navegación

**Estado:** DONE  
**Prioridad:** P0 · **Esfuerzo:** XL  
**Commit auditado:** `b500063c`  
**Depende de:** 024, 025, 026

## Objetivo

Reemplazar por completo la presentación del shell de escritorio con composiciones directas de shadcn/Base UI: titlebar segura, tabs de trabajo, sidebar izquierda y sidebar Many derecha. Conservar stores, IPC, deep links, aislamiento por proyecto y comportamiento de ventana.

## Drift check

Antes de editar, comprobar `git rev-parse --short HEAD`, `git status --short` y releer `AppShell`, `DomeTabBar`, `UnifiedSidebar`, `ContentRouter`, `ShellProjectPicker`, `HomeSidebar` y sus tests. Si cambió su contrato desde `b500063c`, actualizar este plan antes de implementar.

## Problema observado

- Sidebar y tabbar compiten como dos taxonomías; la primera contiene 11+2 destinos y la segunda reconoce al menos 17 hubs.
- El shell mezcla botones/SVG nativos, estados hover manuales, CSS heredado y paneles simultáneos.
- `HomeSidebar` no tiene consumidores activos y mantiene documentación/tours obsoletos.
- El usuario puede terminar con Sources, Side, Studio y Many abiertos al mismo tiempo.

## Arquitectura destino

1. **Safe titlebar:** controles de ventana, tabs de trabajo cerrables, Command, transcripción y toggle de Many.
2. **Sidebar izquierda:** selector de proyecto, lugares permanentes, árbol del workspace y cuenta/Settings.
3. **Centro:** cabecera contextual, toolbar y superficie activa.
4. **Inspector contextual:** no es navegación; se implementa en 028.
5. **Sidebar derecha:** exclusivamente Many.

### Invariante de chrome Electron

- macOS conserva los traffic lights nativos (`trafficLightPosition`) y reserva 80 px a la izquierda.
- Windows y Linux conservan el `titleBarOverlay` nativo y reservan 138 px a la derecha.
- Solo las zonas visualmente vacías usan `-webkit-app-region: drag`; todo control interactivo, tab, menú, input y resize handle usa `no-drag`.
- El shell web de desarrollo puede simular el layout, pero nunca define el contrato de controles de ventana.
- Playwright Electron debe comprobar regiones drag/no-drag, insets por plataforma y altura de titlebar.

Regla: sidebar = lugares permanentes; tabs = trabajo transitorio cerrable. No crear otro wrapper modal o navegación paralela.

## Archivos en alcance

- `app/components/shell/**`
- `app/components/DomeTabBar*`, `app/components/UnifiedSidebar*`, `app/components/HomeSidebar*`
- `app/components/ContentRouter*`, `app/components/ShellProjectPicker*`
- stores/selectores de shell y tabs, solo para adaptar la vista sin alterar persistencia
- CSS del shell y claves i18n correspondientes

## Implementación

1. Añadir pruebas de caracterización para tabs, shortcuts, proyecto activo, rutas/deep links, persistencia de sidebar y apertura/cierre de Many.
2. Construir `AppShell` con `SidebarProvider`, `Sidebar`, `SidebarInset` y una segunda `Sidebar side="right"`; usar `ResizablePanelGroup` únicamente para regiones persistentes redimensionables.
3. Rehacer la titlebar con `Button`, `Tooltip`, `DropdownMenu`, `Tabs`/composición equivalente accesible y `HugeiconsIcon`. Marcar solo la zona vacía como draggable; controles y tabs deben ser `no-drag`.
4. Reducir `UnifiedSidebar` a proyecto, lugares permanentes, workspace tree y footer de usuario/Settings. Agrupar con `SidebarGroup`, `SidebarMenu`, `Collapsible` y `ScrollArea`.
5. Hacer que `DomeTabBar` represente exclusivamente documentos/vistas transitorias, con estado activo, cerrar, reordenar si ya existe, menú contextual y overflow accesible.
6. Montar Many como única sidebar derecha; conservar el store y shortcuts actuales. En anchura estrecha representarla como `Sheet`, no `Drawer` de escritorio.
7. Eliminar `HomeSidebar` y referencias/tours muertos cuando `rg` confirme cero consumidores.
8. Sustituir controles crudos, SVG inline y estilos hover manuales por componentes/tokens shadcn. No usar `transition-all`.
9. Verificar foco al cambiar/cerrar tabs, tooltip de controles icon-only, navegación de teclado y `prefers-reduced-motion`.

## Pruebas y validación

- Tests de renderer: abrir/cerrar/restaurar tabs, cambiar proyecto, navegar por sidebar, toggle Many, shortcuts y foco.
- Playwright Electron: drag region, controles de ventana, sidebar colapsada, dos tamaños de viewport y deep link existente.
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run build`
- `pnpm run check:ipc-inventory`
- `pnpm run depcruise`

## Criterios de aceptación

- Solo existen dos sidebars de app: navegación izquierda y Many derecha.
- No se pierde ningún destino, shortcut, deep link ni tab persistido.
- No quedan imports de `HomeSidebar`, SVG inline de controles ni botones crudos en el shell.
- Todo icon-only tiene nombre accesible y tooltip; shell usable por teclado y reduced motion.

## STOP conditions

- Detener si un cambio exige modificar el protocolo IPC, formato persistido de tabs o contrato cross-repo.
- No borrar una ruta “duplicada” hasta demostrar su sustitución con pruebas.

## Mantenimiento

Documentar la taxonomía sidebar/tabs/Many en arquitectura y añadir una prueba que falle si aparece una tercera sidebar de app.
