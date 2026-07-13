# Plan 025: Crear las fundaciones shadcn y la gramática minimalista de motion

> **Executor instructions**: usa la skill `shadcn`. Ejecuta `pnpm dlx shadcn@latest info --json`, `docs` y `add --dry-run/--diff` antes de añadir o actualizar componentes. No uses `--overwrite`.
>
> **Drift check**: `git diff --stat b500063c..HEAD -- components.json app/components/ui app/components/shared app/globals.css app/styles .claude/rules/ui-style-guidelines.md`

## Status

- **Execution**: DONE
- **Priority**: P0 | **Effort**: L | **Risk**: MED
- **Depends on**: 024
- **Category**: design-system / motion
- **Planned at**: `b500063c`, 2026-07-13

## Why this matters

El proyecto usa `base-luma`, Base UI, Tailwind v4 y Hugeicons, pero no tiene instalados `sidebar`, `resizable`, `table`, `chart`, `breadcrumb`, `item`, `hover-card`, `menubar`, `navigation-menu`, `pagination` ni `accordion`. Las features conservan 11K líneas de CSS paralelo, 55 transiciones indiscriminadas y 27 keyframes. El rediseño necesita una base única antes de sustituir pantallas.

## Current state and target

- Fuente de tokens: `app/globals.css`; P-005 prohíbe colores hardcodeados.
- `app/components/ui/` contiene exclusivamente source shadcn; las composiciones viven en `shared/` o en cada dominio.
- Tokens exactos objetivo:

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
--duration-press: 150ms;
--duration-tooltip: 150ms;
--duration-popover: 200ms;
--duration-overlay: 250ms;
--duration-drawer: 450ms;
```

## Commands

`pnpm run typecheck`; `pnpm run lint`; `pnpm run build`; `pnpm run check:design-system`; `pnpm run depcruise`; `pnpm run test:ui` — todos exit 0.

## Scope

**In scope**: `components.json`, componentes shadcn faltantes, primitivas `ui/`, `globals.css`, composiciones compartidas nuevas, documentación y tests.  
**Out of scope**: pantallas feature, cambios de preset, nueva librería de estilos, wrappers `Dome*`/`Hub*`.

## Steps

1. Añade con CLI los componentes faltantes necesarios: Sidebar, Resizable, Table/DataTable foundation, Chart, Breadcrumb, Item, HoverCard, Accordion, Pagination, Menubar/NavigationMenu sólo si los planes consumidores los usan. Revisa imports y Base UI `render`.
2. Define composiciones app-level pequeñas: `PageHeader`, `PageToolbar`, `StatusView` y `EntityListItem`. Deben componer shadcn, no duplicar props ni variantes.
3. Normaliza `Dialog`, `Sheet`, `Drawer`, `Popover`, `DropdownMenu`, `Tooltip`, `Tabs`, `Button`, `Progress` y `Skeleton`: entrada/salida con ease-out; movimiento visible con ease-in-out; origen `var(--transform-origin)` para overlays anclados.
4. Command palette y acciones de teclado no animan. Dialog usa 200–250ms, opacity + scale 0.95; nunca scale 0. Drawer usa 450ms y `--ease-drawer`.
5. Reduced motion conserva color/opacidad 200ms y elimina traslación, escala, flips, shimmer y movimiento continuo. Motion JS usa `useReducedMotion`.
6. Añade lint/check scripts que rechacen `transition-all`, `transition: all`, nuevos z-index manuales en overlays, `space-x/y`, raw hex y `Dialog/Sheet/Drawer` sin Title.
7. Documenta la matriz: Dialog=tarea focal; AlertDialog=destructiva; Sheet=detalle lateral; Drawer=estrecho/táctil; Popover=selector corto; Resizable=estructura persistente.

## Test plan

- Tests de keyboard/focus para cada overlay y Sidebar.
- Test de reduced motion en primitivas.
- Story/smoke page interna sólo si ya existe infraestructura; no añadir Storybook.
- Feel-check a 10%: origen correcto, interacción interrumpible, sin movimiento de layout.

## Done criteria

- [ ] Componentes requeridos aparecen en `app/components/ui/`
- [ ] `rg 'transition-all|transition: all' app/components/ui app/components/shared` devuelve 0
- [ ] `rg 'scale\(0\)|zoom-in-0' app/components/ui` devuelve 0
- [ ] Tests y gates salen 0
- [ ] No se creó un modal/sidebar propietario paralelo

## STOP conditions

- CLI propone sobrescribir cambios locales sin merge claro.
- Un componente registry no soporta Base UI.
- La fundación exige cambiar contratos de stores o IPC.

## Maintenance notes

Los planes 027–038 deben consumir estas primitivas. Cualquier nueva variante visual se justifica aquí antes de aparecer en una feature.
