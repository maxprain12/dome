# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Dome is an Electron 32 + Vite 7 + React 18 desktop application for knowledge management. See `CLAUDE.md` for full architecture details and `README.md` for development commands.

### Running in Cloud VM

- **Shared memory**: Electron/Chromium requires `/dev/shm` >= 256MB. The default 64MB causes `ERR_INSUFFICIENT_RESOURCES` errors. Resize before starting Electron:
  ```
  sudo mount -o remount,size=512M /dev/shm
  ```
- **Electron flags**: Set `ELECTRON_EXTRA_LAUNCH_ARGS="--disable-gpu --disable-dev-shm-usage --no-sandbox"` when running `bun run electron:dev` in the cloud VM. The `--disable-dev-shm-usage` flag tells Chromium to use `/tmp` instead of `/dev/shm`.
- **Display**: Electron requires an X display. Use `DISPLAY=:1` (provided by the VM's Xvfb).

### Starting Development

```bash
DISPLAY=:1 ELECTRON_EXTRA_LAUNCH_ARGS="--disable-gpu --disable-dev-shm-usage --no-sandbox" bun run electron:dev
```

This starts both the Vite dev server (port 5173) and Electron with hot reload.

### Lint / Type Checking

There is no ESLint configuration. TypeScript type checking is the primary lint mechanism:

```bash
npx tsc --noEmit
```

Note: The codebase has some pre-existing type errors (e.g., in `app/lib/utils/markdown.ts` and `app/workspace/url/client.tsx`). These are known and do not block development.

### Database

SQLite database is auto-created at `~/.config/dome/dome.db` on first launch. Migrations run automatically. No external database service is needed.

### Key Gotchas

- **Bus errors on startup**: D-Bus connection errors (`Failed to connect to the bus`) are harmless in headless environments.
- **GPU process errors**: `Exiting GPU process due to errors during initialization` is expected with `--disable-gpu` flag and does not affect functionality.
- **DevTools auto-open**: In dev mode, DevTools opens in detached mode automatically. This consumes additional resources in the VM; close it if not needed.
- **Native modules**: After `bun install`, the `postinstall` script automatically rebuilds native modules (better-sqlite3, sharp, node-pty, @napi-rs/canvas) for Electron. If you get native module errors, run `bun run rebuild:natives`.
