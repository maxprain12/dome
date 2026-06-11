# 01 — Seguridad

Auditoría de la postura de seguridad de Dome (Electron main process, IPC, secretos, OAuth, ejecución de código). Fecha: 2026-06-09.

## Resumen

| Severidad | Hallazgos |
|-----------|-----------|
| Crítica | 3 (sandbox deshabilitado, secretos en plaintext, inyección vía `executeJavaScript`) |
| Alta | 3 (sin CSP en ventana principal, shell exec sin límites, refresh tokens sin cifrar) |
| Media | 5 (sender sin validar, SSRF, paths externos, OAuth pending sin timeout, ReDoS) |
| Baja | 2 (skip-version sin expiración, auditoría de dependencias) |

## Tareas

| Tarea | Prioridad | Severidad | Esfuerzo | Estado |
|-------|-----------|-----------|----------|--------|
| [T01 — Habilitar sandbox en el renderer](T01-sandbox-renderer.md) | P0 | Crítica | M | ✅ Implementada |
| [T02 — Cifrar API keys y tokens con safeStorage](T02-cifrado-secretos.md) | P0 | Crítica | M | ✅ Implementada |
| [T03 — Eliminar executeJavaScript con datos de usuario (PPT)](T03-ppt-execute-javascript.md) | P0 | Crítica | M | ✅ Implementada |
| [T04 — CSP en la ventana principal (app://)](T04-csp-ventana-principal.md) | P1 | Alta | S | ✅ Implementada |
| [T05 — Validación de sender en todos los handlers IPC](T05-validacion-sender-ipc.md) | P1 | Media | M | ✅ Implementada |
| [T06 — Hardening de shell:exec y fix ReDoS](T06-shell-exec-hardening.md) | P1 | Alta | S | ✅ Implementada |
| [T07 — Bloqueo SSRF a IPs locales y metadata](T07-ssrf-bloqueo-ips.md) | P2 | Media | S | ✅ Implementada |
| [T08 — Timeout y limpieza del estado OAuth pendiente](T08-oauth-timeouts.md) | P2 | Media | S | ✅ Implementada |
| [T09 — Limitar acceso a paths externos en files.cjs](T09-limitar-paths-externos.md) | P2 | Media | M | ✅ Implementada |
| [T10 — Updater y auditoría de dependencias](T10-updater-y-dependencias.md) | P3 | Baja | S | ✅ Implementada |

> **Validación 2026-06-10 (3ª pasada)**: T01–T10 implementadas y verificadas a nivel de código; `pnpm run test:security` (38 tests) en verde en local. T09 cerrada: grants cableados desde los diálogos nativos y drag&drop (canal interno `security:grant-external-path` desde el preload), `allowExternal=true` justificado con comentario en los 21 call-sites. Queda pendiente la verificación en runtime (smoke test de la app y build empaquetado).

## Lo que ya está bien (no duplicar trabajo)

- `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true` en todas las ventanas (`electron/core/window-manager.cjs:40-63`)
- Whitelist `ALLOWED_CHANNELS` completa en `electron/preload.cjs` (~270 canales, no se expone `ipcRenderer` crudo)
- `sanitizePath()` en `electron/core/security.cjs:51-88` bloquea path traversal y null bytes
- Protección de path traversal en el protocol handler `app://` (`electron/main.cjs:627-631`)
- OAuth con PKCE + state aleatorio (`electron/auth/dome-oauth.cjs`)
- CSP restrictiva en el iframe de artifacts (`app/components/chat/artifacts/HtmlArtifactFrame.tsx:70-79`) con `srcdoc` y source-check en postMessage
- Permission handlers restrictivos con whitelist de permisos (`electron/main.cjs:774`)
- Auto-updater vía GitHub Releases con `autoDownload: false`
- Aprobación HITL para `shell:exec` (`electron/ipc/core/shell.cjs:50-54`)

## Orden recomendado

1. T01 (sandbox) y T03 (PPT) juntas — la ventana PPT depende de ambas.
2. T02 (secretos) — independiente, alto impacto.
3. T04 + T05 + T06 — endurecen la superficie ante un renderer comprometido (defensa en profundidad tras T01).
4. T07–T10 — mejoras incrementales.
