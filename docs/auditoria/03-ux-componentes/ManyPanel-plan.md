# Plan de ejecución — trocear ManyPanel (03/T02, último gigante)

**Estado:** pendiente — requiere la app levantada (`pnpm run electron:dev`) para smoke test tras cada fase. ManyPanel es el panel de chat principal; un fallo aquí rompe la UX central, por eso NO se troceó a ciegas.

## Por qué es distinto de los otros gigantes

A diferencia de FolderTabView / RunsWorkspaceView / UnifiedSidebar (que tenían subcomponentes y helpers autocontenidos), ManyPanel es **una sola función de componente** (~1.597 líneas) con:

- ~28 `useState` + 12 `useRef` + selectores de `useManyStore`/`useAppStore`/`useTabStore`/`useApprovalStore`.
- ~30 `useCallback`/`useMemo` que **cierran sobre ese estado** (no hoisteables a nivel de módulo sin pasar decenas de dependencias).
- El bloque pesado es `handleSend` (~654–980, ~292 líneas): orquesta attachments → run → streaming → persistencia.
- Ya delega: `useAgentRunStream` (streaming), `manySendController` (registro del sender global), `runPdfRegionStream`, `UnifiedChatMessageArea`/`ManyChatHeader`/`UnifiedChatInput` (render).

No hay helpers puros a nivel de módulo → no existe extracción de riesgo cero. Cualquier trozo mueve estado y lógica de envío.

## Estrategia: un hook controlador, por fases verificables

Objetivo: `app/components/many/useManyChatController.ts` que posea el estado + lógica y devuelva una interfaz plana; `ManyPanel.tsx` queda como vista que la consume (~600–700 líneas). **Una fase por PR, smoke test entre cada una.**

### Fase A — `useManyChatSettings` (bajo riesgo)
Mover el estado y efectos de *configuración* de la conversación, que están bastante aislados:
`toolsEnabled`, `resourceToolsEnabled`, `memoryEnabled`, `mcpEnabled`, `supportsTools`, `providerInfo`/`providerId`, `userMemory`, y los `useEffect` que los cargan (settings IPC, mcp servers, provider info).
- **Verificar:** abrir Many, togglear tools/memory/mcp, cambiar de proveedor en Settings y ver que el panel refleja el provider correcto.

### Fase B — `useManyBudget` (bajo riesgo)
Mover `lastBudget`/`liveUsage`/`compactionNotice`/`budgetCapApprox` + los `useMemo` `clientBudgetEstimate`/`displayBudget` + el `ContextUsageIndicator` wiring.
- **Verificar:** enviar mensajes y ver que el indicador de contexto sube; provocar compaction.

### Fase C — `useManySend` (riesgo ALTO — el núcleo)
Mover `handleSend`, `handleAbort`, `handleRegenerate`, `handlePdfRegionSend`, `streamingMessage`/`pdfRegionStreamingMessage`/`activeRunId`/`abortController`/`pendingApproval`, el `useAgentRunStream` y el `registerManyMessageSender`.
- **Verificar exhaustivamente:** enviar un mensaje y ver streaming token a token; enviar con attachments (imagen, PDF, video); abortar a mitad; regenerar; un run que dispara aprobación HITL (aceptar y rechazar); selección de región de PDF → enviar; voz global con panel cerrado (modo headless).

### Fase D — sesiones e historial (bajo riesgo)
Mover `handleSelectSession`/`handleToggleHistory`/`handleClear`/`refreshSessionFromThread`/`applyRunSnapshot` + `showHistory`.
- **Verificar:** cambiar de chat en el historial, chat nuevo, limpiar, y que el snapshot de un run en curso se recupera al reabrir.

## Reglas

- Refactor **puro**: prohibido mezclar cambios funcionales. Si aparece un bug, es una regresión del movimiento, no una "mejora".
- Mantener la API pública de `ManyPanel` (`width`, `onClose`, `isVisible`, `isFullscreen`, `mode`) intacta.
- El `mode='headless'` (motor de mensajes sin UI para voz global) debe seguir funcionando — es fácil olvidarlo al mover render.
- Tras cada fase: `pnpm run typecheck && pnpm run lint && pnpm run build` + el smoke de esa fase antes de la siguiente.

## Criterio de cierre

ManyPanel.tsx por debajo de ~700 líneas, los 4–5 hooks en `app/components/many/`, y el chat (enviar/stream/abort/regenerate/HITL/voz/historial) idéntico al actual verificado en runtime.
