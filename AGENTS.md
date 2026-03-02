# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Dome is an Electron 32 + Vite 7 + React 18 desktop app for knowledge management. See `CLAUDE.md` for full architecture details and `README.md` for feature documentation.

### Development commands

All dev commands use `bun run`. Key scripts are in `package.json`:

- **Dev mode**: `bun run electron:dev` (starts Vite on `:5173` + Electron)
- **Vite only**: `bun run dev` (just the React frontend at `http://localhost:5173`)
- **Build**: `bun run build` (Vite production build to `dist/`)
- **Native modules**: `bun run rebuild:natives` / `bun run verify:natives`
- **DB test**: `bun run test:db`

### Dependency installation

The project has `package-lock.json` (npm lockfile) but scripts reference `bun`. Use npm for dependency installation:

```
npm install --legacy-peer-deps
```

The `--legacy-peer-deps` flag is required because `@tiptap/*` packages have peer dependency conflicts between v2 and v3.

After npm install, two packages that are imported directly but not listed in `package.json` must be installed explicitly:

```
npm install @tiptap/extension-history @tiptap/suggestion --legacy-peer-deps
```

Then run the postinstall steps:

```
npx electron-builder install-app-deps
npx electron-rebuild -f -w=better-sqlite3,sharp,@ffmpeg-installer/ffmpeg,@napi-rs/canvas,node-pty
node scripts/copy-pdf-worker.cjs
```

### Headless / Cloud VM caveats

- **Electron rendering**: Electron's preload script fails in the Cloud VM with `"TypeError: object null is not iterable"` in `renderer_init`. This is an Electron 32 + headless environment incompatibility. The React UI renders correctly in Chrome at `http://localhost:5173` instead.
- **Vite dev server is the primary way to test UI** in Cloud VMs. Run `npx vite --port 5173` and open in Chrome.
- **Electron main process works fine**: SQLite database, file storage, and all IPC handlers initialize correctly. The issue is only with the renderer/preload bridge.
- **GPU errors**: `viz_main_impl.cc` and D-Bus errors are expected and harmless in headless environments.
- **No ESLint config**: The project does not have an ESLint configuration. TypeScript strict mode (`npx tsc --noEmit`) has pre-existing errors.
- **No automated test suite**: There is no test runner configured (no jest/vitest/playwright tests). `bun run test:db` tests only database connectivity.

### Database

SQLite database is created automatically at `~/.config/dome/dome.db` on first Electron launch. Migrations run automatically. No external database server needed.
