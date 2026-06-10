# T04 — Content-Security-Policy en la ventana principal (app://)

**Prioridad**: P1 · **Severidad**: Alta · **Esfuerzo**: S · **Área**: Seguridad
**Estado**: ✅ Implementada (verificación de código 2026-06-10) — nuevo `electron/core/csp.cjs` aplicado desde `main.cjs` (header CSP en app:// y dev). **Fix post-smoke-test (2026-06-10):** `connect-src` necesitaba `data:`/`blob:` (y `app:` en prod) — los viewers hacen `fetch()` de payloads devueltos como data-URLs y el visor de PDF mostraba "Failed to fetch". Pendiente: verificar el header en build de producción.

## Problema

La ventana principal (carga `app://dome/` en producción y `http://localhost:5173` en dev) **no tiene CSP**. El iframe de artifacts sí la tiene (`HtmlArtifactFrame.tsx:70-79`), pero el documento principal no. Sin CSP, cualquier XSS (markdown renderizado, contenido scrapeado, datos de un plugin) ejecuta scripts con todos los privilegios del renderer.

## Qué hay que hacer

1. Añadir CSP vía `session.defaultSession.webRequest.onHeadersReceived` en `electron/main.cjs` (o en `electron/core/security.cjs` si se quiere centralizar), aplicándola a respuestas `app://` y, en dev, a `http://localhost:5173`:
   ```
   default-src 'self' app:;
   script-src 'self';
   style-src 'self' 'unsafe-inline';
   img-src 'self' app: data: blob: https:;
   media-src 'self' app: blob:;
   connect-src 'self' http://localhost:* ws://localhost:* https:;
   font-src 'self' data:;
   object-src 'none';
   base-uri 'self';
   frame-src 'self' blob:;
   ```
   Ajustar tras inventariar lo que la app realmente carga (proveedores LLM van por el main, pero el renderer hace fetch a algunos servicios — revisar `app/lib/ai/`).
2. Vite en dev usa HMR con inline scripts: si rompe, aplicar una CSP relajada solo cuando `!app.isPackaged`.
3. Verificar que los artifacts (iframe `srcdoc`) siguen funcionando — el `srcdoc` hereda la CSP del padre además de la suya; `frame-src`/`script-src` del padre no deben bloquear el boot script del iframe (puede requerir `'unsafe-inline'` scoped o mover el boot a un blob).
4. Endurecer también la navegación si falta: `will-navigate` restringido y `setWindowOpenHandler` → `shell.openExternal` + `deny` (verificar estado actual en `electron/main.cjs` / `window-manager.cjs` y completar si no existe).

## Criterios de aceptación

- [ ] DevTools → Network muestra el header CSP en el documento principal en build de producción.
- [ ] Un `<script>` inyectado de prueba en contenido renderizado es bloqueado (verificable con un snippet de prueba en una nota).
- [ ] Chat, artifacts, viewers, imágenes remotas y HMR en dev funcionan.

## Riesgos / notas

- Es fácil romper features que cargan recursos remotos (imágenes de recursos web, logos de proveedores). Hacer un pase por la app con la consola abierta buscando violaciones CSP antes de dar por cerrado.
- Depende conceptualmente de T01: CSP + sandbox juntos es la combinación que neutraliza XSS.
