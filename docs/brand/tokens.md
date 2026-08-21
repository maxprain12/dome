# Dome — tokens de marca (light)

Valores canónicos del producto escritorio. Landing y provider deben mapear a estos hex (o equivalentes oklch del desktop).

## Color

| Rol | Hex | CSS desktop | CSS landing | CSS provider |
|-----|-----|-------------|-------------|--------------|
| Chrome bg | `#F2F2F2` | `--background` | `--color-bg` | `--background` |
| Surface | `#FFFFFF` | `--card` | `--color-surface` | `--card` |
| Ink | `#1A1A1A` | `--foreground` | `--color-text` | `--foreground` |
| Muted | `#8C8C8C` | `--muted-foreground` | `--text-muted` | `--muted-foreground` |
| Primary / CTA | `#4A5D3F` | `--primary` | `--color-accent` | `--primary` |
| Primary hover | `#5E7153` | `--primary-hover` | — | — |
| Lime | `#DDE9B2` | `--brand-lime` | `--c-lime` / soft accent | `--accent` / soft |
| Mint | `#EEF5E0` | `--brand-mint` | `--c-mint` | muted soft |
| Lavender | `#CFD1EB` | `--brand-lavender` | `--c-lavender` | secondary tint |
| Border | `#D9D9D9` | `--border` | `--color-border` | `--border` |
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
| Background | `#141612` |
| Surface | `#1C1F1A` |
| Ink | `#F2F2F0` |
| Primary (sage) | `#A8B89A` |

## Tipografía

| Token | Valor |
|-------|--------|
| `--font-sans` / `--font-display` | Inter |
| `--font-mono` | JetBrains Mono |

Sin Instrument Serif en ningún repo de marca.

## Radios (producto)

- Botones / chips: pill (`rounded-full`)
- Cards: `rounded-2xl`
- Inputs: `rounded-md`
