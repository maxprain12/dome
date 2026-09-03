# Dome — tokens de marca (light)

Valores canónicos del producto escritorio (shadcn Neutral / zinc). Landing y provider deben mapear a estos hex (o equivalentes oklch del desktop). Si esos repos tienen hex propios, no se cambian aquí.

## Color

| Rol | Hex | CSS desktop | CSS landing | CSS provider |
|-----|-----|-------------|-------------|--------------|
| Chrome bg | `#F4F4F5` | `--background` | `--color-bg` | `--background` |
| Surface | `#FAFAFA` | `--card` | `--color-surface` | `--card` |
| Ink | `#27272A` | `--foreground` | `--color-text` | `--foreground` |
| Muted | `#71717A` | `--muted-foreground` | `--text-muted` | `--muted-foreground` |
| Primary / CTA | `#27272A` | `--primary` | `--color-accent` | `--primary` |
| Primary hover | `#3F3F46` | `--primary-hover` | — | — |
| Lime (Many mark only) | `#DDE9B2` | `--brand-lime` | `--c-lime` | Many symbol |
| Mint (legacy tint) | `#EEF5E0` | `--brand-mint` | `--c-mint` | unused in chrome |
| Lavender | `#CFD1EB` | `--brand-lavender` | `--c-lavender` | secondary tint |
| Border | `#E4E4E7` | `--border` | `--color-border` | `--border` |
| Success | `#5B8F42` | `--success` | — | — |
| Destructive | `#BD3F32` | `--destructive` | `--color-problem` | `--destructive` |

### Many mark

| Rol | Hex |
|-----|-----|
| Body fill | `#E0EAB4` |
| Eyes / stroke | `#596037` |

### Dark (desktop only)

| Rol | Hex |
|-----|-----|
| Background | `#18181B` |
| Surface | `#27272A` |
| Ink | `#FAFAFA` |
| Primary (ink inverted) | `#FAFAFA` |
| Border | `oklch(1 0 0 / 10%)` |

## Profundidad

Sin sombras. `--shadow-*` = `none`. La elevación es un borde (`--border`) más un escalón de superficie (`--card` sobre `--background`). Anillos de foco (`0 0 0 2px var(--ring)`) se conservan por accesibilidad.

## Tipografía

| Token | Valor |
|-------|--------|
| `--font-sans` / `--font-heading` / `--font-display` | Inter |
| `--font-mono` | JetBrains Mono |

Sin Instrument Serif en ningún repo de marca.

## Radios (producto)

- Botones / chips: pill (`rounded-full`)
- Cards: `rounded-2xl`
- Inputs: `rounded-md`
