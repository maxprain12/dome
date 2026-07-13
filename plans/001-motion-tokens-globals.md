# Plan 001: Definir tokens de motion en globals.css

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada verificación antes de continuar. Si ocurre algo en STOP conditions, detente y reporta.
>
> **Drift check (run first)**: `git diff --stat b500063c..HEAD -- app/globals.css`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt / motion
- **Planned at**: commit `b500063c`, 2026-07-13

## Why this matters

Los tokens actuales en `globals.css` usan `ease-in-out` genérico y no se consumen desde `app/components/ui/`. Hay ~40 sitios con `transition-all` y curvas ad-hoc. Sin tokens compartidos, cada plan de motion/shadcn inventará valores distintos.

## Current state

- `app/globals.css:260-262` — `--transition-fast: 120ms ease-in-out`, `--transition-base: 220ms ease-in-out`, `--transition-slow: 300ms cubic-bezier(0.16, 1, 0.3, 1)`
- `app/globals.css:357-366` — reduced-motion global con `0.01ms !important` en todo (demasiado agresivo; se aborda en plan 023)
- Referencia AUDIT.md (improve-animations): curvas objetivo:
  - `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`
  - `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`
  - `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Typecheck | `pnpm run typecheck` | exit 0 |
| Lint | `pnpm run lint` | exit 0 |
| Build | `pnpm run build` | exit 0 |
| Design system | `pnpm run check:design-system` | exit 0 |

## Scope

**In scope:**
- `app/globals.css` (bloque `:root` / `[data-theme]`)

**Out of scope:**
- Cambios en componentes TSX (plan 007)
- Reduced-motion refactor (plan 023)

## Steps

### Step 1: Añadir tokens de easing y duración

En `app/globals.css`, junto a `--transition-*` existentes, añadir (sin borrar los legacy aún):

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out-strong: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
--duration-instant: 100ms;
--duration-fast: 150ms;
--duration-ui: 200ms;
--duration-overlay: 250ms;
--duration-drawer: 450ms;
```

Actualizar `--transition-fast/base/slow` para usar `--ease-out` en entradas UI.

**Verify**: `grep -n 'ease-out' app/globals.css` → al menos 4 matches

### Step 2: Documentar presupuestos en comentario

Añadir comentario de 3 líneas encima de los tokens: "UI ≤300ms; overlays 150-250ms; drawer hasta 450ms".

**Verify**: `pnpm run build` → exit 0

## Done criteria

- [ ] Tokens `--ease-out`, `--ease-drawer`, `--duration-*` existen en `globals.css`
- [ ] `pnpm run typecheck` exit 0
- [ ] `pnpm run build` exit 0
- [ ] `plans/README.md` fila 001 → DONE

## STOP conditions

- Si `globals.css` ya contiene tokens idénticos con nombres distintos → reportar antes de duplicar.

## Maintenance notes

Planes 007, 016, 017, 023 referencian estos tokens. No renombrar sin actualizar esos planes.
