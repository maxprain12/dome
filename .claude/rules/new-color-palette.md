# Dome Color Palette — Brand System

Fuente de verdad runtime: `app/globals.css` (`:root` / `.dark` + `data-theme` para success). Paleta **Neutral / zinc** (chroma ~0). Sombras: `--shadow-*` = `none`; profundidad por border + un escalón de surface.
No usar hex en componentes TSX — tokens semánticos (`bg-primary`, `text-muted-foreground`, `bg-brand-lime`, …).

## Light (hoja corporativa)

| Rol | Hex | Token CSS / Tailwind |
|-----|-----|----------------------|
| Primary / CTA | `#27272A` | `--primary` · `bg-primary` |
| On CTA | `#FAFAFA` | `--primary-foreground` |
| Hover zinc | `#3F3F46` | `--primary-hover` · `bg-primary-hover` |
| Lime (Many / tintes raros) | `#DDE9B2` | `--brand-lime` · `bg-brand-lime` |
| Mint (tintes raros) | `#EEF5E0` | `--brand-mint` · `bg-brand-mint` |
| Lavender (tintes raros) | `#CFD1EB` | `--brand-lavender` · `bg-brand-lavender` |
| Chrome bg | `#F4F4F5` | `--background` |
| Surface | `#FAFAFA` | `--card` / `--popover` |
| Ink | `#27272A` | `--foreground` |
| Border / input | `#E4E4E7` | `--border` / `--input` |
| Muted text | `#71717A` | `--muted-foreground` |
| Success | `#5B8F42` | `--success` · `text-success` |
| Success soft | `#DDE9B2` | `--success-bg` |
| Error | `#BD3F32` | `--destructive` · `text-destructive` |
| Soft fill | zinc-100 | `--secondary` / `--accent` |

Focus ring = ink (`--ring` = primary). No drop-shadow.

## Dark (equivalentes)

| Rol | Hex | Token |
|-----|-----|-------|
| Background | `#18181B` | `--background` |
| Card | `#27272A` | `--card` |
| Ink | `#FAFAFA` | `--foreground` |
| Primary (ink inverted) | `#FAFAFA` | `--primary` |
| On primary | `#18181B` | `--primary-foreground` |
| Primary hover | `#FFFFFF` | `--primary-hover` |
| Lime / mint / lavender | `#3A4228` / `#2A3020` / `#2E2F3A` | `--brand-*` |
| Border | `oklch(1 0 0 / 10%)` | `--border` |
| Destructive | `#E07066` | `--destructive` |
| Success | `#8FBC6E` / bg `#24301C` | `--success` / `--success-bg` |

## Active selection (nav, filtros, filas)

Principio de selección activa (sidebar y hubs, p. ej. **Social**):

| Estado | Tratamiento |
|--------|-------------|
| Activo | `bg-brand-mint` + `border-primary` + radio redondeado (`rounded-xl` filas / `rounded-full` chips) |
| Idle | borde transparente o `border-border`; hover `bg-brand-mint/55` |
| No usar | solo gris `bg-accent` / `bg-muted` como único indicador de activo |

Helper TS: `selectionSurfaceClass()` en `app/components/shared/selectionSurface.ts`.  
Utilidades CSS: `.dome-selection` / `[data-active='true']` / `.dome-selection-chip` en `app/globals.css`.

## Hub page header (gris)

Chrome del título de sección (Correo, Agentes, Social, …): componente `HubPageHeader` → siempre `bg-muted`. No usar `bg-card` en ese bloque.

## Componentes (variantes)

| Control | Variantes de marca |
|---------|-------------------|
| `Button` | pill `rounded-full`; `default` solid ink; `outline`/`secondary` outline; `soft` lime |
| `Badge` | `lime` / `mint` / `lavender` (+ default/destructive/outline) |
| `Card` | `default` / `lime` / `mint` / `lavender` / `brand` (solid primary); `rounded-2xl`; sin sombra |
| `Input` | focus ink vía `--ring`; error `--destructive` |

## Tipografía

Familia: **Inter Variable** (`--font-sans`).

Escala de marca (heroes / empty states): `--text-h1`…`--text-caption` → utilidades `text-brand-h1`, `leading-brand-h1`, etc.
UI de producto densa: seguir `text-xs` / `text-sm` en controles shadcn.

## Deprecated (no usar)

- Paleta purple/lavender antigua (`#7b76d0`, `#998eec`)
- Forest / olive legacy (`#4A5D3F`, `#141612`)
- Variables fantasma: `--primary-text`, `--bg`, `--bg-secondary`, `--error` (usar `--foreground`, `--background`, `--card`, `--destructive`)
- `--brand-primary` legacy
- Drop-shadows de chrome (`shadow-sm` / `md` / `lg` son inertes)

## DO / DON'T

### DO
- `bg-primary` / `hover:bg-primary-hover` para CTAs
- `Badge variant="lime|mint|lavender"` para chips de categoría
- `Card variant="lime|lavender|brand"` para superficies tinted
- Selección activa con `selectionSurfaceClass` / mint + `border-primary`
- Tokens motion existentes (`--duration-*`, `--ease-out`) en overlays
- Profundidad por `border` + `--card` sobre `--background`

### DON'T
- Hex en `className` o `style` de componentes de app
- `rounded-md` en botones de acción (usar el `Button` pill)
- Mezclar acentos azul cielo / morados genéricos / forest legacy
- Usar solo `bg-accent` / gris para marcar ítem activo en nav o Social
- Añadir `box-shadow` decorativo en chrome de producto
