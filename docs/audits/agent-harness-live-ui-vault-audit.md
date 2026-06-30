# Auditoría del harness del agente — streaming en vivo, UI de Many y vault → workspace

> Auditoría de 3 problemas reportados en producción sobre el agente (Many), cruzando el código
> contra la fuente de **pi** vendorada en `/pi` (ver también [pi-parity-audit.md](pi-parity-audit.md)).
> Realizada con 3 subagentes en paralelo + verificación directa sobre el código. Incluye causa raíz,
> fix aplicado y tests por cada parte.

| Problema | Veredicto | Causa raíz | Fix |
|---|---|---|---|
| 1. Las trazas de tools/thinking solo aparecen al **terminar** el ciclo (el chat "recarga" con todo) | **Bug confirmado (renderer)** | `applyRunSnapshot` pisa los deltas en cada `runs:updated` | Merge en vez de rebuild |
| 2. Interfaz de Many **rota** (indicador "23%" y pill de modelo duplicados) | **Bug confirmado (UI)** | Slot de contexto sin guard `isFullscreen` | Placement header XOR composer |
| 3. Carpetas/notas físicas del agente **no refrescan** el Workspace; el watcher no se entera | **Bug confirmado (vault) + modelo mental incorrecto** | El `resource_create` del agente nunca escribía el archivo físico | Mirror al vault en `resourceCreate` |

---

## Problema 1 — El streaming en vivo se pierde en el renderer

**El main y el IPC sí streamean cada evento incrementalmente.** El audit previo (§3.1/§4.1) está
**desactualizado**: `mapAgentEventToChunk` ya mapea `tool_execution_start/end/update` y `message_update`
correctamente (`electron/agents/agent-runtime.cjs:286-334`), y `createRunChunkEmitter` emite cada chunk
de inmediato por `runs:chunk` (`electron/agents/run-engine.cjs:294-423`). El agent-core también emite
`tool_execution_start` **antes** de ejecutar la tool (`packages/agent-core/src/agent-loop.ts:407-412`),
no después.

**Dónde se rompe — `ManyPanel` (renderer):** el `streamingMessage` lo manejan **dos canales a la
misma frecuencia**:

- `runs:chunk` / `runs:step` → deltas vivos (text, thinking, tool_call, tool_result, run-steps),
  acumulados correctamente por `useAgentRunStream` (`app/lib/chat/useAgentRunStream.ts`).
- `runs:updated` → **snapshot completo** de la fila del run. `patchRun` lo emite **en cada chunk**
  (escritura de heartbeat, `electron/agents/run-store.cjs:179-197`, `emit(RUN_EVENT_CHANNEL,…)`
  incondicional en `:197`).

El antiguo `applyRunSnapshot` (`app/components/many/ManyPanel.tsx:400-415`) **reconstruía** el mensaje
desde el snapshot y solo arrastraba `toolCalls`, **descartando `thinking` y `runSteps`**. Como la fila
del run no tiene deltas de thinking/tools mientras está `running` (los tool calls se persisten solo al
terminal, `run-engine.cjs:619`), el snapshot **borraba continuamente** el thinking vivo y la línea de
tiempo de tools. La lista completa solo re-materializaba al final vía la recarga del JSONL
(`refreshSessionFromThread` → `hydrateSession`) — exactamente el síntoma "todo aparece de golpe al
recargar".

**Cómo lo hace pi:** un único `EventStream` ordenado consumido una sola vez; la TUI renderiza
directamente de ese stream, sin un canal de "snapshot persistido" que re-deriva y sobreescribe la vista
viva. El bug es un artefacto de integración de Dome (capa de persistencia run-store/run-engine que
bifurca el stream), no existe en pi.

**Fix aplicado:** reducer puro `app/lib/chat/runSnapshotMerge.ts` →
`mergeRunSnapshotIntoStreamingMessage(prev, snapshot)` que **mergea** en vez de reconstruir: preserva
`thinking`, `runSteps`, `toolCalls` y solo deja que el snapshot sea autoritativo de
`content`/`isStreaming`/`timestamp`. Cableado en `applyRunSnapshot` (`ManyPanel.tsx`).

**Mejoras recomendadas (no aplicadas, menor riesgo/segundas):**
- `patchRun`: no emitir `runs:updated` cuando el único cambio es `lastHeartbeatAt` (quita el snapshot de
  alta frecuencia que compite con los deltas). `run-store.cjs:179-197`.
- Fuente única de verdad: que `useAgentRunStream` sea el único escritor del `streamingMessage` durante
  el run y `runs:updated` solo gobierne el **estado** (flags/terminal), nunca el cuerpo del mensaje.

**Test:** `scripts/test-streaming-snapshot.mts` (`pnpm run test:streaming-snapshot`) — 6 casos: el merge
preserva thinking/runSteps/toolCalls, no regresa a tool list vacía a mitad del run, y el snapshot manda
en content/isStreaming/timestamp/label.

---

## Problema 2 — UI de Many: indicador de contexto duplicado

El indicador de contexto (la dona "23%") se montaba en **header y composer a la vez** en modo docked
(sidebar). La copia del header estaba correctamente gateada `!isFullscreen && showContextUsage`
(`ManyPanel.tsx:1445`), pero `composerContextUsageSlot` solo se gateaba con `showContextUsage` (sin
guard de `isFullscreen`, `ManyPanel.tsx:1280`) y se pasaba al composer en ambas ramas → **duplicado**.

**Fix aplicado:** helper puro `app/lib/many/contextSlotPlacement.ts` →
`manyContextSlotPlacement({ isFullscreen, showContextUsage })` con el contrato **header (docked) XOR
composer (fullscreen)**, invariante `!(header && composer)`. Cableado en ambos sitios de `ManyPanel`.

**Pendiente recomendado (no aplicado — decisión de diseño con sutilezas de container-queries):** el
**pill de modelo** también se renderiza en header y composer; en sidebar estrecho el header muestra un
`InlineModelSwitcher` compacto (`ManyChatHeader.tsx:123-125` + CSS `globals.css:2185-2192`) a la vez que
el del composer (`ManyChatInput.tsx:533-537`) → dos switchers. Fix sugerido: un único dueño — ocultar el
modelo del header cuando está docked (dropear el swap `.many-hd-model--compact`, dejando solo el
`ProviderModelChip` informativo) y que el composer sea el switcher. Las tool cards y el sizing del panel
**no tienen bug** (cumplen el design system; el "apretado" venía de los duplicados).

**Test:** `scripts/test-context-slot-placement.mts` (`pnpm run test:context-slot-placement`) — 5 casos
incluyendo la invariante de que nunca se monta en ambas superficies.

---

## Problema 3 — Vault → Workspace no se refresca

**Corrección del modelo mental:** el watcher (`electron/storage/vault-watcher.cjs`, chokidar sobre
`dome-files/vault`, arrancado en `electron/main.cjs:1161-1162`) es **external-only por diseño**: suprime
las escrituras propias de la app vía `markSelfWrite` (`vault-watcher.cjs:274` → `vault-store.cjs:47`). El
watcher **no es, ni puede ser**, el mecanismo de refresco para items creados por la propia app/agente.
El refresco viene de broadcasts explícitos `resource:created/updated/deleted`.

**Causa raíz (confirmada):** el `resource_create` del agente
(`electron/tools/ai-tools-handler.cjs:1613-1644`) insertaba la fila en SQLite + hacía broadcast, pero
**nunca escribía el archivo físico** — sin `createFolderOnDisk` ni `writeNoteMarkdown`, con `file_path`
y `vault_path` en NULL. La premisa "el agente crea un archivo físico en el vault" era **falsa**: no había
nada en disco para que el workspace (que refleja el vault) lo mostrara, y un `readNoteMarkdown`
posterior devolvía "No mirror". El path IPC de creación (`electron/ipc/data/database.cjs:323-345`) **sí**
hace el mirror; el del agente había quedado desincronizado.

**Fix aplicado:** en `resourceCreate` se añadió el bloque de mirror al vault con paridad a
`database.cjs`: carpetas → `vaultStore.createFolderOnDisk(id, { database, fileStorage })`; notas con
contenido → seed de `content_text`. Ahora los items del agente existen en disco con `vault_path`
persistido.

**Pendientes recomendados (no aplicados):**
- `useResources` (`app/lib/hooks/useResources.ts:143-148`) hace **optimistic-insert** del payload del
  broadcast sin refetch; si el payload llega con campos faltantes/mismatched (`folder_id`/`project_id`),
  el item se inserta pero el filtro de vista lo descarta hasta recargar. Recomendado: refetch debounced
  como hace `UnifiedSidebar` (`app/components/workspace/UnifiedSidebar.tsx:277-333`), o estandarizar el
  payload del broadcast. (`UnifiedSidebar`, el panel de la captura, **sí** refetch-ea.)
- Scope de proyecto: runs de automatización/pipeline crean en `automationProjectId`; el sidebar está
  scoped a `hubProjectId` → el item se filtra hasta cambiar de proyecto. Documentar/afinar.
- `SourcesPanel` no se suscribe a `resource:*` (solo carga on-mount) — añadir suscripción.

**Test:** `electron/__tests__/vault-mirror-create.test.mjs` (`pnpm run test:vault-mirror`, usa
`node:sqlite` para evitar el ABI native de Electron) — verifica end-to-end contra un vault temporal real
que `createFolderOnDisk` crea el directorio físico + persiste `vault_path`, que `writeNoteMarkdown`
escribe un `.md` físico dentro de la carpeta y round-trips, y que la nota queda anidada bajo la carpeta
del agente.

---

## Cómo ejecutar los tests

```bash
pnpm run test:streaming-snapshot       # Problema 1 (reducer del streaming)
pnpm run test:context-slot-placement   # Problema 2 (placement del indicador)
pnpm run test:vault-mirror             # Problema 3 (mirror al vault)
```

## Archivos tocados

- `electron/tools/ai-tools-handler.cjs` — mirror al vault en `resourceCreate` (fix 3).
- `app/lib/chat/runSnapshotMerge.ts` — reducer puro (fix 1, nuevo).
- `app/components/many/ManyPanel.tsx` — usa el merge + el placement (fix 1 y 2).
- `app/lib/many/contextSlotPlacement.ts` — helper de placement (fix 2, nuevo).
- `scripts/test-streaming-snapshot.mts`, `scripts/test-context-slot-placement.mts`,
  `electron/__tests__/vault-mirror-create.test.mjs` — tests (nuevos).
- `package.json` — scripts de test.
