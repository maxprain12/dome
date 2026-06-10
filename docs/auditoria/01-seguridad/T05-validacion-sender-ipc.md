# T05 — Validación de sender en todos los handlers IPC

**Prioridad**: P1 · **Severidad**: Media · **Esfuerzo**: M · **Área**: Seguridad
**Estado**: ✅ Implementada (verificación de código 2026-06-10) — nuevo `electron/core/ipc-guard.cjs` (`createSecureIpcMain`) envuelve todos los `ipcMain.handle` desde `ipc/index.cjs` con `validateSender`. Pendiente: el check de CI que impida registrar handlers fuera del guard (paso 4) y smoke test en runtime.

## Problema

La validación `windowManager.isAuthorized(event.sender.id)` se aplica de forma inconsistente. `electron/ipc/data/files.cjs:17-99` la hace en todos sus handlers, pero muchos otros no validan el sender, p. ej.:

- `electron/ipc/data/interactions.cjs` — `db:interactions:create` y compañía
- `electron/ipc/data/tags.cjs`
- `electron/ipc/data/graph.cjs`

Con ~270 canales whitelisted, cualquier webContents no autorizado (iframe, webview futura, ventana comprometida) podría invocar mutaciones de DB.

## Qué hay que hacer

1. No parchear handler por handler: crear un wrapper central en `electron/ipc/index.cjs` (o un helper `electron/core/ipc-guard.cjs`) tipo `secureHandle(channel, handler)` que:
   - valide `windowManager.isAuthorized(event.sender.id)` (y opcionalmente `event.senderFrame.url` contra `app://dome/` / `localhost:5173`),
   - loguee y rechace con `{ success: false, error: 'Unauthorized' }` si falla.
2. Migrar el registro de handlers a ese wrapper. La forma menos invasiva: en `index.cjs`, en vez de exponer `ipcMain` directo a cada módulo de dominio, pasarles el wrapper, o monkey-patchear el registro en un único punto.
3. Canales que legítimamente reciben de ventanas especiales (ppt-capture oculta) deben registrarse en el window-manager como autorizados al crearse.
4. Añadir un check de CI: extender `check:ipc-inventory` (ya existe en `.github/workflows/ci.yml`) para fallar si un handler registra `ipcMain.handle` directamente sin pasar por el guard (grep estático).
5. Aprovechar para revisar la validación de inputs: los dominios con Zod (p. ej. `threads.cjs:21-57`, `shell.cjs`) están bien; listar los dominios `data/*` sin schema y añadir validación mínima de tipos en los handlers de mutación.

## Criterios de aceptación

- [ ] Todos los handlers de `electron/ipc/**` pasan por el guard de sender (verificado por el check de CI).
- [ ] Una invocación desde un webContents no registrado devuelve `Unauthorized` (test manual con una ventana de prueba).
- [ ] Sin regresiones: smoke test de DB (proyectos, recursos, tags, interactions, graph), chat y runs.

## Riesgos / notas

- La ventana oculta de PPT y cualquier utility window deben quedar registradas como autorizadas o sus canales se romperán — coordinar con [T03](T03-ppt-execute-javascript.md).
- El guard debe ser barato (lookup en Set) — corre en cada invoke.
