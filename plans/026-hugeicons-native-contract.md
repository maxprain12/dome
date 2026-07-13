# Plan 026: Eliminar el contrato Lucide y adoptar Hugeicons nativo

> **Executor instructions**: migración por contratos y dominios; no borres el adapter hasta que el conteo sea cero.
>
> **Drift check**: `git diff --stat b500063c..HEAD -- package.json pnpm-lock.yaml app/components/icons app/components app/lib`

## Status

- **Execution**: IN PROGRESS
- **Priority**: P0 | **Effort**: L | **Risk**: MED
- **Depends on**: 024, 025
- **Category**: migration / design-system
- **Planned at**: `b500063c`, 2026-07-13

## Why this matters

`lucide-react` ya no es una dependencia, pero `app/components/icons/lucide-adapter.tsx` recrea `LucideProps`, `LucideIcon` y 250 aliases y es importado por aproximadamente 270 archivos. La nueva UI debe expresarse con `IconSvgElement` y `HugeiconsIcon`, no con nombres, tamaños o `strokeWidth` heredados de Lucide.

## Current state

- `components.json` configura `iconLibrary: "hugeicons"`.
- `app/components/icons/lucide-adapter.tsx:1-278` es la capa a retirar.
- Contratos tipados relevantes: `app/lib/resources/resourceVisual.tsx`, `AISettingsPanel.tsx`, `ChatComposerPlusMenu.tsx` y otros usos de `LucideIcon`.
- `@tabler/icons-react` sigue en `package.json` sin importadores.

## Commands

`pnpm run typecheck`; `pnpm run lint`; `pnpm run build`; `pnpm run test:ui`; `pnpm run check:design-system` — exit 0.

## Scope

**In scope**: adapter, contratos iconográficos, todos sus consumidores, dependencies, lint rule y tests.  
**Out of scope**: `tiptap-icons/` SVG especializados, logos de marca, contenido/iconos de plugins externos.

## Steps

1. Define `DomeIcon` como dato `IconSvgElement`, no componente compatible Lucide. Matrices/config reciben objetos de `@hugeicons/core-free-icons` y renderizan `<HugeiconsIcon icon={icon}>`.
2. Migra primero los contratos con `LucideIcon/LucideProps`; después `ui/shared`, shell/settings y, finalmente, cada dominio en el orden 027–037.
3. Dentro de `Button`, `DropdownMenuItem`, `TabsTrigger`, `SidebarMenuButton`, `Alert` y similares usa `data-icon`; no declares tamaños. Tamaño explícito sólo para ilustraciones, canvas o visualizadores.
4. Fija un peso óptico único mediante el componente Hugeicons, sin overrides arbitrarios por callsite. Documenta excepciones.
5. Elimina `@tabler/icons-react` y lockfile asociado después de verificar cero importadores.
6. Cuando `rg "lucide-adapter|LucideIcon|LucideProps" app` devuelva 0, borra el adapter.
7. Añade una regla ESLint/check que prohíba `lucide-react`, `lucide-adapter`, tipos Lucide y nuevos paquetes de iconos no aprobados.

## Test plan

- Tests de configuración que renderiza iconos recibidos como objetos.
- Smoke visual de shell, Settings, chat, estados y recursos.
- No snapshots de paths SVG completos; afirma roles, labels y presencia de `svg`.

## Done criteria

- [ ] Cero resultados para `lucide-adapter|LucideIcon|LucideProps|lucide-react|@tabler/icons-react`
- [ ] `package.json` contiene únicamente Hugeicons como biblioteca general de iconos
- [ ] Cero sizing manual dentro de componentes shadcn salvo excepciones documentadas
- [ ] Gates y tests salen 0

## STOP conditions

- No existe equivalente Hugeicons semánticamente correcto: selecciona y documenta alternativa antes de continuar.
- Un plugin público depende del tipo Lucide; conserva un adapter en el boundary del plugin, no en la UI interna, y repórtalo.

## Maintenance notes

No hagas una sustitución nominal ciega. El rediseño debe escoger el icono por significado y dejar que el componente shadcn controle escala y alineación.
