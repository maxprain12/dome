# Dome Color Palette — Brand System

Fuente de verdad runtime: `app/globals.css` (`:root` / `.dark` + `data-theme` para success/shadows).
No usar hex en componentes TSX — tokens semánticos (`bg-primary`, `text-muted-foreground`, `bg-brand-lime`, …).

## Light (hoja corporativa)

| Rol | Hex | Token CSS / Tailwind |
|-----|-----|----------------------|
| Primary / CTA | `#4A5D3F` | `--primary` · `bg-primary` |
| On CTA | `#FFFFFF` | `--primary-foreground` |
| Hover olive | `#5E7153` | `--primary-hover` · `bg-primary-hover` |
| Lime | `#DDE9B2` | `--brand-lime` · `bg-brand-lime` |
| Mint | `#EEF5E0` | `--brand-mint` · `bg-brand-mint` |
| Lavender | `#CFD1EB` | `--brand-lavender` · `bg-brand-lavender` |
| Chrome bg | `#F2F2F2` | `--background` |
| Surface | `#FFFFFF` | `--card` / `--popover` |
| Ink | `#1A1A1A` | `--foreground` |
| Border / input | `#D9D9D9` | `--border` / `--input` |
| Muted text | `#8C8C8C` | `--muted-foreground` |
| Success | `#5B8F42` | `--success` · `text-success` |
| Success soft | `#DDE9B2` | `--success-bg` |
| Error | `#BD3F32` | `--destructive` · `text-destructive` |
| Soft fill | mint | `--secondary` / `--accent` |

Focus ring = forest (`--ring` = primary).

## Dark (equivalentes)

| Rol | Hex | Token |
|-----|-----|-------|
| Background | `#141612` | `--background` |
| Card | `#1C1F1A` | `--card` |
| Ink | `#F2F2F0` | `--foreground` |
| Primary (sage) | `#A8B89A` | `--primary` |
| On primary | `#141612` | `--primary-foreground` |
| Primary hover | `#B8C6AA` | `--primary-hover` |
| Lime / mint / lavender | `#3A4228` / `#2A3020` / `#2E2F3A` | `--brand-*` |
| Destructive | `#E07066` | `--destructive` |
| Success | `#8FBC6E` / bg `#24301C` | `--success` / `--success-bg` |

Primary en dark **no** se invierte a blanco casi puro: usa sage legible sobre fondos oliva-negros.

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
| `Button` | pill `rounded-full`; `default` solid forest; `outline`/`secondary` outline forest; `soft` lime |
| `Badge` | `lime` / `mint` / `lavender` (+ default/destructive/outline) |
| `Card` | `default` / `lime` / `mint` / `lavender` / `brand` (solid primary); `rounded-2xl` |
| `Input` | focus forest vía `--ring`; error `--destructive` |

## Tipografía

Familia: **Inter Variable** (`--font-sans`).

Escala de marca (heroes / empty states): `--text-h1`…`--text-caption` → utilidades `text-brand-h1`, `leading-brand-h1`, etc.
UI de producto densa: seguir `text-xs` / `text-sm` en controles shadcn.

## Deprecated (no usar)

- Paleta purple/lavender antigua (`#7b76d0`, `#998eec`)
- Variables fantasma: `--primary-text`, `--bg`, `--bg-secondary`, `--error` (usar `--foreground`, `--background`, `--card`, `--destructive`)
- `--brand-primary` legacy

## DO / DON'T

### DO
- `bg-primary` / `hover:bg-primary-hover` para CTAs
- `Badge variant="lime|mint|lavender"` para chips de categoría
- `Card variant="lime|lavender|brand"` para superficies tinted
- Selección activa con `selectionSurfaceClass` / mint + `border-primary`
- Tokens motion existentes (`--duration-*`, `--ease-out`) en overlays

### DON'T
- Hex en `className` o `style` de componentes de app
- `rounded-md` en botones de acción (usar el `Button` pill)
- Mezclar acentos azul cielo / morados genéricos con la marca forest
- Usar solo `bg-accent` / gris para marcar ítem activo en nav o Social
