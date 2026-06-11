# T09 — Limitar acceso a paths externos en files.cjs

**Prioridad**: P2 · **Severidad**: Media · **Esfuerzo**: M · **Área**: Seguridad
**Estado**: ✅ Implementado (2026-06-10) — denylist (`~/.ssh`, `~/.aws`, `~/.gnupg`, Keychains, gcloud) + log de acceso externo + `grantExternalPath` con TTL en `security.cjs` (test `security-path.test.mjs`, 6 tests). **Cableado de grants**: los 4 diálogos nativos de `ipc/core/system.cjs` (`select-file`, `select-files`, `select-folder`, `show-save-dialog`) registran los paths devueltos; conceder un directorio concede su subárbol (TTL 1h, denylist sigue aplicando). Drag&drop: el preload concede el path tras `webUtils.getPathForFile` vía canal interno `security:grant-external-path` (no expuesto en `window.electron`; webUtils solo resuelve Files respaldados por disco, así que el renderer no puede acuñar grants arbitrarios). **`allowExternal=true` justificado**: los 21 call-sites en `electron/ipc/` llevan comentario (`// allowExternal: …`) — importación por diálogo/drop (granted), workspace de notebook fuera de userData, tools de agente (gobernadas por HITL/caps), open-path/show-item (propósito del canal) y diálogo-en-handler (el path nunca viaja por el renderer). Los accesos externos sin grant siguen permitidos pero se loguean (`[Security] External path access`); endurecer a bloqueo estricto requeriría migrar los flujos con paths persistidos (notebook workspace) y queda como mejora futura opcional.

## Problema

`electron/ipc/data/files.cjs` llama sistemáticamente a `sanitizePath(filePath, true)` con `allowExternal = true` (líneas 24, 51, 73, 92, 110, …). `sanitizePath` (`electron/core/security.cjs:51-88`) bloquea `..` y null bytes, pero con `allowExternal=true` permite **cualquier ruta absoluta del sistema**: `/etc/passwd`, `~/.ssh/id_rsa`, etc.

Es intencional (file pickers, importación de archivos), pero significa que un renderer comprometido —o un agente al que el usuario aprueba una tool— puede leer todo el disco accesible al usuario.

## Qué hay que hacer

1. Clasificar los handlers de `files.cjs` (y otros que reciban paths del renderer: `resources.cjs`, `storage.cjs`, media):
   - **Paths elegidos por el usuario vía diálogo nativo**: el main debe obtener el path del `dialog.showOpenDialog` directamente (el renderer recibe un token/ID, no manda el path de vuelta). Es el patrón más seguro: el path nunca viaja por IPC.
   - **Paths dentro de userData / file-storage**: usar `allowExternal=false` (whitelist de `allowedPaths()`).
   - **Paths externos legítimos sin diálogo** (drag & drop): validar contra una sesión de "paths concedidos" — al hacer drop, el main registra el path como permitido para esa operación.
2. Implementar el registro de paths concedidos (Set con TTL) en `electron/core/security.cjs` y exponer `grantPath(path)` para los flujos de diálogo/drop.
3. Reducir los `allowExternal=true` restantes a los handlers que de verdad lo necesiten, con comentario justificando cada uno.
4. Añadir denylist mínima incluso en modo externo: `~/.ssh`, `~/.aws`, `~/.gnupg`, keychains del SO.

## Criterios de aceptación

- [ ] `grep -n "sanitizePath(.*true)" electron/ipc/` solo muestra handlers justificados con comentario.
- [ ] Leer `~/.ssh/id_rsa` vía IPC falla aunque el canal exista.
- [ ] Importar archivos por diálogo y por drag & drop sigue funcionando.

## Riesgos / notas

- Es la tarea de seguridad con más riesgo de regresión funcional (muchos flujos tocan archivos). Hacerla después de T01/T05 y con smoke test amplio: importar PDF, audio, video, PPTX, Excel, imágenes; exportar artifacts.
- Si el coste es alto, una versión mínima válida: mantener `allowExternal=true` pero con la denylist del punto 4 + log de auditoría de accesos externos.
