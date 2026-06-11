# 01 — Seguridad — Implementación y validación

**Rama:** `fix/auditoria-seguridad-p0-p2` · **Fecha:** 2026-06-09

## Resumen

| Tarea | Estado | Notas |
|-------|--------|-------|
| T01 Sandbox | ✅ | `sandbox: true` en ventana principal y PPT |
| T02 Cifrado secretos | ✅ | `secret-storage.cjs` + `settings-secrets.cjs`; OAuth tokens cifrados |
| T03 PPT executeJavaScript | ✅ | IPC `ppt-capture:*` |
| T04 CSP ventana principal | ✅ | `electron/core/csp.cjs` |
| T05 Validación sender IPC | ✅ | `ipc-guard.cjs` envuelve todos los handlers |
| T06 shell:exec + ReDoS | ✅ | `shell-policy.cjs` + picomatch |
| T07 SSRF web fetch | ✅ | `url-guard.cjs` |
| T08 OAuth timeouts | ✅ | 10 min dome + mcp |
| T09 Paths externos | ✅ | Denylist + grants desde diálogos/drag&drop; 21 `allowExternal=true` justificados con comentario |
| T10 Updater + deps | ✅ | Skip expira a 7 días; `pnpm audit` en CI |

## Archivos clave

- `electron/core/secret-storage.cjs`, `settings-secrets.cjs`, `ipc-guard.cjs`, `csp.cjs`
- `electron/services/web/url-guard.cjs`
- `electron/core/shell-policy.cjs`
- `electron/documents/ppt-slide-extractor.cjs`, `app/pages/PptCapturePage.tsx`
- `electron/auth/dome-oauth.cjs`, `electron/mcp/mcp-oauth.cjs`
- `electron/core/update-service.cjs`

## Cómo validar

```bash
# Sin sandbox deshabilitado
grep -rn "sandbox: false" electron/   # → 0 resultados

# Sin executeJavaScript con datos PPT
grep -n "executeJavaScript" electron/documents/ppt-slide-extractor.cjs  # → 0

# Tests de seguridad
pnpm run test:security

# Secretos cifrados (tras usar la app y guardar una API key)
sqlite3 ~/Library/Application\ Support/dome/dome.db \
  "SELECT key, substr(value,1,12) FROM settings WHERE key LIKE '%api_key%';"
# Esperado: valores empiezan por enc:v1:

# SSRF bloqueado (desde agente o test unitario)
pnpm run test:security  # url-guard suite

# OAuth timeout: iniciar login Dome/MCP, cerrar navegador → a los 10 min UI debe salir de "conectando"

# Updater skip: saltar versión, avanzar reloj 8 días o esperar → aviso reaparece

# CSP (build prod): DevTools → Network → documento principal tiene header Content-Security-Policy

# shell:exec denylist: agente intenta rm -rf / → rechazo sin diálogo HITL
```

## T09 — cierre (2026-06-10)

- Diálogos nativos (`select-file/files/folder`, `show-save-dialog` en `ipc/core/system.cjs`) registran los paths con `grantExternalPath` (TTL 1h; un directorio concede su subárbol).
- Drag&drop: el preload concede el path tras `webUtils.getPathForFile` vía canal interno `security:grant-external-path` (no expuesto en `window.electron`).
- Los 21 call-sites con `sanitizePath(..., true)` en `electron/ipc/` llevan comentario de justificación; los no concedidos siguen permitidos pero logueados.
- Mejora futura opcional: bloqueo estricto de externos sin grant (requiere migrar flujos con paths persistidos, p. ej. workspace de notebook).
