# T08 — Timeout y limpieza del estado OAuth pendiente

**Prioridad**: P2 · **Severidad**: Media · **Esfuerzo**: S · **Área**: Seguridad
**Estado**: ✅ Implementada (verificación de código 2026-06-10) — `registerOAuthPending()` en `dome-oauth.cjs:234-239` con `OAUTH_PENDING_TIMEOUT_MS` (delete + reject al vencer); aplicado también en `mcp-oauth.cjs`. Pendiente: verificar en runtime que la UI sale del estado "conectando" al expirar.

## Problema

`electron/auth/dome-oauth.cjs:227`: las solicitudes OAuth pendientes se guardan en `global.__domeOAuthPending` (Map keyed por `state`) y **nunca se limpian si el usuario cancela** o el callback no llega:

```js
const pending = global.__domeOAuthPending || (global.__domeOAuthPending = new Map());
pending.set(state, { resolve, reject, codeVerifier, userId });
shell.openExternal(authUrl.toString());
// sin timeout: la entrada (y su codeVerifier) vive para siempre
```

Consecuencias: promesas que nunca resuelven (UI colgada en "conectando…"), acumulación de `codeVerifier`s en memoria, y estados antiguos que siguen siendo válidos indefinidamente (ventana de replay más amplia de lo necesario).

## Qué hay que hacer

1. Añadir timeout por entrada (10 min):
   ```js
   const t = setTimeout(() => {
     if (pending.delete(state)) reject(new Error('OAuth timeout'));
   }, 10 * 60 * 1000);
   ```
   y `clearTimeout(t)` + `pending.delete(state)` en el camino de éxito y de error del callback.
2. Aplicar el mismo patrón en el OAuth de MCP (`electron/mcp/mcp-oauth.cjs`) si usa un mecanismo de pendings similar — revisarlo.
3. En la UI (panel de settings/auth que dispara el flujo), manejar el rechazo por timeout con un mensaje claro y opción de reintentar.
4. Marcar cada `state` como de un solo uso: al recibir el callback, borrar la entrada **antes** de intercambiar el code (ya implícito con `delete`, verificar el orden).

## Criterios de aceptación

- [ ] Iniciar login y cerrar el navegador sin completar → a los 10 min la promesa rechaza, la UI sale del estado "conectando" y `__domeOAuthPending` queda vacío.
- [ ] Completar el flujo normal sigue funcionando (Dome OAuth y MCP OAuth).
- [ ] Un callback con `state` ya consumido o desconocido se ignora con log.

## Riesgos / notas

- Trivial de implementar; el único cuidado es no romper el caso de múltiples flujos simultáneos (varias entradas en el Map con timeouts independientes).
