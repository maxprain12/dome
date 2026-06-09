# SOP: Workspace packages (`@dome/*`) in production builds

## Problem

Root `package.json` depends on workspace packages (`@dome/ai`, `@dome/agent-core`, `@dome/tools`). pnpm installs them as **symlinks** under `node_modules/@dome/*` → `packages/*`.

electron-builder copies those symlinks into `app.asar`, but `packages/` is **not** in `build.files`. At runtime:

```
Cannot find module '.../app.asar/node_modules/@dome/ai/dist/index.js'
```

Dev works because the full repo is on disk.

## Required pipeline (before electron-builder)

```bash
pnpm run build:packages          # tsc → packages/*/dist
pnpm run materialize:workspace-deps  # replace symlinks with real dirs (package.json + dist)
pnpm run verify:workspace-deps   # fail fast if still symlinks or missing dist
```

These run automatically in `electron:build`, `electron:pack`, and `.github/workflows/build.yml`.

## When you add a new `@dome/*` main-process dependency

1. Add it to `WORKSPACE_PKGS` in `scripts/materialize-workspace-deps.cjs` and `scripts/verify-workspace-deps.cjs`.
2. Add it to `build:packages` filter in `package.json` if it needs `tsc`.
3. Run a packaged build locally (`pnpm run electron:build`) and launch Many.

## Checklist

- [ ] `packages/<pkg>/dist` built (`build:packages`)
- [ ] `node_modules/@dome/<pkg>` is a **directory**, not a symlink (`verify:workspace-deps`)
- [ ] Packaged app starts Many without module-not-found errors
