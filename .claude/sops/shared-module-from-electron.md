# SOP: Adding a `require` from `electron/` into `shared/`

Follow these steps in order. Missing the packaging step will cause the app to crash in production with `Cannot find module '../shared/...'` while working fine in dev.

## Why this matters

`shared/` lives at the repo root, outside `electron/` and `dist/`. electron-builder only packages the paths listed under `build.files` in `package.json`. In dev, the source tree is on disk and `require` resolves fine; in the packaged build everything inside `app.asar` is **only** what was whitelisted.

If you add a `require('../shared/...')` or `require('../../shared/...')` from `electron/**/*.cjs` without adding `shared/**/*` to `build.files`, the packaged build will fail at startup.

## Reference: existing `require`s into `shared/`

These already exist and work in production only because `shared/**/*` is now in `build.files`:

- `electron/system-prompt.cjs` → `../shared/prompt-assembler/index.cjs`
- `electron/prompt-sections.cjs` → `../shared/prompt-assembler/index.cjs`
- `electron/bench/bench-prompt.cjs` → `../../shared/prompt-assembler/index.cjs`
- `electron/message-multimodal.cjs` → `../shared/message-visual/parse-markdown-images.cjs`

## Step 1: Add or update the `require` in `electron/`

The file under `electron/` (or any subdir) does the import:

```javascript
// electron/<file>.cjs
const { foo } = require('../shared/<subdir>/<module>.cjs');
```

Constraints:
- Use a `.cjs` file (the main process is CJS). TS source in `shared/` must be compiled to `.cjs` (see `scripts/build-prompt-assembler.mjs` for the pattern) **before** it is reachable from `electron/`.
- Path must be relative — `require('shared/...')` does not resolve.

## Step 2: Make sure the file is on disk

- Pure CJS (`.cjs`): nothing else to do, the file is shipped as-is.
- TypeScript source (`.ts`): add a build step that emits `.cjs` next to the source (see `pnpm run build:prompt-assembler`). The emitted `.cjs` is what gets required and shipped.

## Step 3: Confirm `shared/**/*` is in `package.json` → `build.files`

`package.json`:

```json
"build": {
  "files": [
    "dist/**/*",
    "electron/**/*",
    "shared/**/*",
    "prompts/**/*",
    "package.json",
    ...
  ]
}
```

If the line `"shared/**/*"` is missing, add it. **Do not** add a narrower glob (e.g. `"shared/message-visual/**/*"`) — it will break the next person who adds a module under a new `shared/<subdir>/`.

## Step 4: Verify locally before opening a PR

```bash
pnpm run build        # Vite build
pnpm run electron:build   # full electron-builder packaging
# Then launch the packaged app from release/ and confirm it starts without
# "Cannot find module '../shared/...'" in the main-process console.
```

A green CI build is **not** enough — CI runs `pnpm run build` (Vite only), not `pnpm run electron:build`. The asar packaging step is the one that would have caught this bug.

## Checklist

- [ ] `require` path in `electron/<file>.cjs` is relative and ends in `.cjs`
- [ ] Target module exists in `shared/<subdir>/` and is committed
- [ ] If target is `.ts`, a build step emits `.cjs` and runs as part of the build pipeline
- [ ] `package.json` → `build.files` contains `"shared/**/*"`
- [ ] Packaged build (`pnpm run electron:build`) launches without module-not-found errors
