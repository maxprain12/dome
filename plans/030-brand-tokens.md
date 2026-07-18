# Plan 030: Brand tokens light + dark in globals.css

> **Status**: DONE (implemented on branch)  
> **Planned at**: `3ef2723a`  
> **Depends on**: none  
> **Category**: direction / design-system

## Why

`--primary` was near-black olive; brand sheet requires forest `#4A5D3F`, tints lime/mint/lavender, and dark equivalents (not inverted white primary).

## Done criteria (verified)

- [x] `:root` / `.dark` remap in `app/globals.css`
- [x] `--primary-hover`, `--brand-lime|mint|lavender`
- [x] Type scale tokens + `@theme` bridges
- [x] `--radius: 0.75rem`; success/destructive brand hex
- [x] Dark sidebar-primary no longer purple
- [x] `pnpm run typecheck` exits 0
