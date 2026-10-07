# SOP: Workspace packages (`@dome/*`) in production builds

## Problem

Root `package.json` depends on the workspace packages `@dome/tools` and `@dome/db` (and `@dome/prompts`, `@dome/i18n`). pnpm installs them as **symlinks** under `node_modules/@dome/*` → `packages/*`.

electron-builder copies those symlinks into `app.asar`, but `packages/` is **not** in `build.files`. At runtime:

```
Cannot find module '.../app.asar/node_modules/@dome/tools/dist/index.js'
```

Dev works because the full repo is on disk.

`@dome/ai` and `@dome/agent-core` are **not** workspace packages any more: they are npm aliases of the registry packages `@maxprain12/ai` / `@maxprain12/agent-core` (private repo `manys-kit`, GitHub Packages). They are ordinary dependencies that live under `node_modules/.pnpm`, so electron-builder bundles them without any materialization (verified with `electron-builder --dir`: `app.asar` contains `node_modules/@dome/ai`, `@dome/agent-core` and `@maxprain12/ai`). Same for `@maxprain12/remote-many`. Packaging needs an authenticated install (`NPM_TOKEN`), see CLAUDE.md → Private packages (manys-kit).

## Required pipeline (before electron-builder)

```bash
pnpm run build:packages          # tsc → packages/{tools,db}/dist
pnpm run materialize:workspace-deps  # replace symlinks with real dirs (package.json + dist)
pnpm run verify:workspace-deps   # fail fast if still symlinks or missing dist
```

These run automatically in `electron:build`, `electron:pack` and `scripts/release/build.mjs` (via `bootstrap:release-deps`).

## When you add a new `@dome/*` main-process workspace dependency

1. Add it to `WORKSPACE_PKGS` in `scripts/materialize-workspace-deps.cjs` and `scripts/verify-workspace-deps.cjs`.
2. Add it to `build:packages` filter in `package.json` if it needs `tsc`.
3. Run a packaged build locally (`pnpm run electron:build`) and launch Many.

## When you add a new registry package that the main process loads

1. Add it to `dependencies` (not `devDependencies`) and run `pnpm run check:packaged-deps`.
2. If it ships a `.node` addon or a spawned binary, follow CLAUDE.md → asarUnpack (`pnpm run check:asar-unpack`).

## Checklist

- [ ] `packages/<pkg>/dist` built (`build:packages`) for `tools` and `db`
- [ ] `node_modules/@dome/{tools,db}` are **directories**, not symlinks (`verify:workspace-deps`)
- [ ] Packaged app starts Many without module-not-found errors
