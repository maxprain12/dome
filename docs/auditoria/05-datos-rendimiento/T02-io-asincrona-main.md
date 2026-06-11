# T02 — I/O asíncrona en el main process (tools PPT/Excel, file-tree)

**Prioridad**: P1 · **Severidad**: Media · **Esfuerzo**: M · **Área**: Rendimiento
**Estado**: ✅ Implementada (2026-06-10) — `buildFileTree` convertido a async (`fs.promises.stat/readdir`, callers en `ai-tools-handler.cjs` y `ipc/data/files.cjs` actualizados); `ppt-tools-handler.cjs` y `excel-tools-handler.cjs` usan `fs.promises.readFile/writeFile` en export/get. Los `existsSync` puntuales restantes son baratos (ruta fría) y se dejan documentados. Pendiente menor: smoke test con archivos >50MB.

## Problema

Varios handlers de tools hacen I/O síncrona en el main process, bloqueando el event loop (toda la app deja de responder: IPC, ventanas, streams de chat):

- `electron/tools/ppt-tools-handler.cjs:311` — `fs.readFileSync()` del .pptx; `:314` — `fs.writeFileSync()`
- `electron/tools/excel-tools-handler.cjs:482,500` — `fs.writeFileSync()`
- `electron/tools/file-tree.cjs:73,93` — `fs.statSync()` + `fs.readdirSync()` recursivos sobre directorios arbitrarios

Con un PPTX/Excel de >50MB o un árbol de directorios grande, el lag es perceptible (streams de chat congelados, ventana "beachballing").

## Qué hay que hacer

1. **Conversión directa a async** (suficiente en la mayoría de casos): `fs.promises.readFile/writeFile/stat/readdir`. Los handlers de tools ya son async (devuelven promesas al dispatcher), así que el cambio es local.
2. **file-tree**: además de async, paralelizar con prudencia (`Promise.all` por directorio con límite de concurrencia ~16) y respetar/añadir límites de profundidad y de número de entradas (cap de resultados) — también mitiga el coste en árboles enormes.
3. **Barrido general**: `grep -rn "readFileSync\|writeFileSync\|readdirSync\|statSync\|existsSync" electron/tools/ electron/documents/ electron/ipc/` y clasificar:
   - rutas calientes (handlers de tools/IPC llamados durante runs) → migrar a async;
   - rutas frías (arranque, configuración una vez) → dejar sync, es más simple y no afecta.
   - `existsSync` puntuales son baratos; no obsesionarse.
4. **Casos extremos** (parsing CPU-bound de PPTX/Excel gigantes): si tras pasar a async sigue habiendo bloqueo (el parseo en sí es síncrono en JS), valorar moverlo a un `utilityProcess` como ya se hizo con embeddings (`electron/workers/embeddings-worker.cjs` como referencia). Solo si se demuestra necesario.

## Criterios de aceptación

- [ ] `grep` de I/O sync en `electron/tools/` y `electron/documents/` limpio en rutas calientes (excepciones comentadas).
- [ ] Generar un PPT/Excel grande mientras hay un chat en streaming: el stream no se congela.
- [ ] `file_tree` sobre un directorio con >10k entradas responde con cap y sin congelar la UI.

## Riesgos / notas

- Cambiar sync→async puede alterar el orden de ejecución dentro de un handler: revisar que no haya estado compartido entre llamadas que dependiera de la atomicidad implícita del sync.
- better-sqlite3 es síncrono por diseño y está bien así (queries locales son µs); esta tarea es de filesystem, no de DB.
