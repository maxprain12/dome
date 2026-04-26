# Fronteras: renderer y main (Electron)

## Renderer (`app/`)

- Sin `node:fs`, `better-sqlite3`, `child_process` ni módulos del runtime de escritorio. Ver **P-001** en [../principles.md](../principles.md).
- Comunicación solo vía `window.electron` expuesto en `electron/preload.cjs` (lista blanca `ALLOWED_CHANNELS`).

## Main (`electron/`)

- `ipcMain.handle` y `ipcMain.on` en `electron/ipc/<dominio>.cjs`, registrados en `electron/ipc/index.cjs`.
- Validar `event.sender` y rutas/inputs; ver auditoría `security` y `.claude/sops/new-ipc-channel.md`.

## Zod en el límite (P-002)

Los **nuevos** archivos con handlers deben validar entradas con Zod. Los legados se listan en `scripts/ipc-zod-legacy.txt` hasta migración. Comprobación: `npm run check:ipc-zod`.
