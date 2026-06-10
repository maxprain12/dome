# T03 — Eliminar executeJavaScript con datos de usuario (extractor PPT)

**Prioridad**: P0 · **Severidad**: Crítica · **Esfuerzo**: M · **Área**: Seguridad
**Estado**: ✅ Implementada (verificación de código 2026-06-10) — 0 llamadas a `executeJavaScript` en el extractor; `PptCapturePage.tsx` y `preload.cjs` migrados a mensajería IPC; la ventana corre con `sandbox: true`. Pendiente: prueba end-to-end con PPTX reales (normal, grande, corrupto).

## Problema

`electron/documents/ppt-slide-extractor.cjs` inyecta el contenido del PPTX del usuario directamente en la ventana oculta vía `executeJavaScript`:

```js
// ppt-slide-extractor.cjs:143-164 (aprox.)
const slideCount = await win.webContents.executeJavaScript(
  `window.__pptCapture.init(${JSON.stringify(pptxBase64)})`,
);
```

Combinado con `sandbox: false` en esa misma ventana (línea 120), un PPTX manipulado que logre romper el `JSON.stringify`/parser de `pptx-preview` se convierte en vector de ejecución de código en un contexto con Node. Aunque `JSON.stringify` escapa bien strings, el patrón "datos de usuario interpolados en código" es frágil y se rompe con cualquier refactor.

## Qué hay que hacer

1. Sustituir la interpolación de datos por mensajería estructurada:
   - Opción recomendada: enviar el base64 con `win.webContents.send('ppt-capture:init', pptxBase64)` y que `app/pages/PptCapturePage.tsx` escuche por `window.electron.on(...)`. Añadir los canales `ppt-capture:init` / `ppt-capture:render-slide` / `ppt-capture:result` a `ALLOWED_CHANNELS` en `electron/preload.cjs` y registrar la respuesta vía `ipcRenderer.send` de vuelta (o un `ipcMain.handleOnce` por captura).
   - Mantener `webContents.capturePage()` para el screenshot — eso no cambia.
2. Si queda algún `executeJavaScript`, que sea solo de expresiones constantes sin datos (p. ej. el check de readiness `typeof window.__pptCapture !== 'undefined'`, líneas 67-84), o sustituirlo por un mensaje `ppt-capture:ready` emitido por la página.
3. Activar `sandbox: true` en esta ventana (coordinado con [T01](T01-sandbox-renderer.md)).
4. Asegurar que la ventana oculta se destruye siempre (try/finally con `win.destroy()`) incluso si la captura falla, para no acumular BrowserWindows ocultas.
5. Probar con: PPTX normal, PPTX grande (>20MB), PPTX corrupto, y nombre de archivo con caracteres raros.

## Criterios de aceptación

- [ ] `grep -n "executeJavaScript" electron/documents/ppt-slide-extractor.cjs` no muestra ninguna llamada que interpole datos del usuario.
- [ ] La extracción de slides funciona end-to-end (importar un PPTX → thumbnails generados).
- [ ] La ventana oculta se cierra siempre, incluso en error (verificar con `BrowserWindow.getAllWindows().length` tras varias extracciones fallidas).
- [ ] La ventana corre con `sandbox: true`.

## Riesgos / notas

- `app/pages/PptCapturePage.tsx` expone `window.__pptCapture.{init, renderSlide}`; al pasar a IPC, ese contrato cambia — actualizar la memoria/docs del patrón (CLAUDE.md sección "PPT Slide Extraction").
- Revisar también otros usos de `executeJavaScript` en el repo (`grep -rn "executeJavaScript" electron/`) y aplicar el mismo criterio: nunca interpolar datos no constantes.
