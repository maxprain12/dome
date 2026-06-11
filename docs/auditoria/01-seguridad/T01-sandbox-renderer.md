# T01 — Habilitar sandbox en el renderer

**Prioridad**: P0 · **Severidad**: Crítica · **Esfuerzo**: M · **Área**: Seguridad
**Estado**: ✅ Implementada (verificación de código 2026-06-10) — `sandbox: true` en `window-manager.cjs:42` y `ppt-slide-extractor.cjs:98`; `grep "sandbox: false" electron/` = 0. Pendiente: smoke test en runtime y build empaquetado.

## Problema

Todas las ventanas se crean con `sandbox: false`:

- `electron/core/window-manager.cjs:42` — ventana principal y todas las creadas vía `windowManager.create()`
- `electron/documents/ppt-slide-extractor.cjs:120` — ventana oculta de captura PPT

Con el sandbox deshabilitado, el preload corre con acceso completo a Node.js. Si un atacante consigue XSS en el renderer (vía contenido web scrapeado, un artifact malicioso, o un PPTX manipulado), puede escalar a ejecución de código nativo con los permisos del usuario. El sandbox es la última línea de defensa de Electron y la propia guía del repo (`.claude/rules/electron-best-practices.md`) lo exige.

## Qué hay que hacer

1. Cambiar `sandbox: false` → `sandbox: true` en `electron/core/window-manager.cjs:42`.
2. Arrancar la app (`pnpm run electron:dev`) y revisar la consola del main: con sandbox activo, el preload solo puede usar los módulos permitidos (`electron` renderer APIs, `events`, `timers`, `url`). Buscar en `electron/preload.cjs` cualquier `require` de módulos Node no soportados (`fs`, `path`, `os`, etc.) y eliminarlo o moverlo al main process detrás de un canal IPC.
3. Repetir para la ventana oculta de PPT (`electron/documents/ppt-slide-extractor.cjs:120`). Esta ventana carga la ruta `/ppt-capture` de la propia app, así que debe funcionar igual que la principal (coordinar con [T03](T03-ppt-execute-javascript.md)).
4. Buscar otras creaciones de `BrowserWindow` fuera del window-manager (`grep -rn "new BrowserWindow" electron/`) y aplicar el mismo cambio donde falte.
5. Smoke test completo: chat/Many, viewers (PDF, video, audio), extracción PPT, transcripción, settings, marketplace — todo lo que toque `window.electron`.

## Criterios de aceptación

- [ ] `grep -rn "sandbox: false" electron/` devuelve 0 resultados.
- [ ] `electron/preload.cjs` no requiere módulos Node fuera de los permitidos por el sandbox.
- [ ] La app arranca y todas las funciones que usan IPC funcionan en dev y en build empaquetado (`pnpm run electron:build`).
- [ ] La extracción de slides PPT sigue funcionando.

## Riesgos / notas

- El riesgo principal es que el preload dependa de algo que el sandbox prohíbe; el error aparece al arrancar, así que la verificación es rápida.
- Hacer esta tarea antes que T04/T05/T06: esas son defensa en profundidad y tienen menos valor mientras el sandbox esté apagado.
