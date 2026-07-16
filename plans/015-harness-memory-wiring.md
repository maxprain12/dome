# Plan 015 — Harness + cableado de memoria

**Estado:** DONE · **Prioridad:** P0 · **Esfuerzo:** L  
**Depende de:** —

## Objetivo

Auditar y arreglar el cableado entre AgentHarness, LTM (`martin/`) y superficies Many/automations: project-memory huérfano, automations solo con soul, `memoryEnabled` incoherente, frontera session vs LTM vs skills documentada y respetada en código.

## Drift check

| Pieza | Path | Gap |
|-------|------|-----|
| LTM I/O | [`electron/personality/personality-loader.cjs`](../electron/personality/personality-loader.cjs) | OK |
| Context trim | [`electron/personality/context-files.cjs`](../electron/personality/context-files.cjs) | Inyecta USER+MEMORY+3 días |
| Project AGENTS.md | [`electron/personality/project-memory.cjs`](../electron/personality/project-memory.cjs) | **Sin callers** |
| Many load | [`useManyConversationSettings.ts`](../app/lib/many/useManyConversationSettings.ts), [`useManySend.ts`](../app/lib/many/useManySend.ts) | `memoryEnabled` solo quita tool |
| Automations many | [`run-engine.cjs`](../electron/agents/run-engine.cjs) | Solo `soul` |
| Harness | [`packages/agent-core/src/harness/agent-harness.ts`](../packages/agent-core/src/harness/agent-harness.ts), [`dome-harness-bridge.cjs`](../electron/agents/dome-harness-bridge.cjs) | Session JSONL ≠ LTM |
| Tool | [`packages/tools/src/families/memory.ts`](../packages/tools/src/families/memory.ts) `remember_fact` | Modelo-driven only |
| Prompt | [`packages/prompts/sections/role-many.txt`](../packages/prompts/sections/role-many.txt) | Pide remember_fact |

### Frontera (documentar en código + docs)

```
agent-sessions/*.jsonl  →  historial + compaction (efímero de run)
martin/SOUL|USER|MEMORY →  LTM del usuario
~/.dome/skills          →  procedural SKILL.md
AGENTS.md (vault)       →  memoria de proyecto
```

## Decisiones cerradas

1. Cablear `project-memory` al `volatileContext` de Many cuando hay proyecto activo.
2. Targets automation `many` reciben el mismo bloque memory recortado que Many (USER+MEMORY+recent), no solo soul.
3. `memoryEnabled=false` deja de inyectar el bloque LTM **y** el tool `remember_fact`.
4. No mezclar session compaction con escritura a MEMORY.md.

## Implementación

1. API helper única `loadAgentMemoryContext({ includeProject, projectPath?, memoryEnabled })` en personality/context-files (o bridge).
2. Many: respetar `memoryEnabled` en inyección del bloque `user-memory`.
3. `run-engine` target many: llamar helper (con caps de chars existentes).
4. Many send: si proyecto activo, append `project-memory` trimmeado.
5. Actualizar [`docs/architecture/agent-runtime.md`](../docs/architecture/agent-runtime.md) con la frontera.
6. Tests unit del helper (flags on/off, trim).

## Validación

- Test: memoryEnabled false → sin bloque ni tool.
- Test: automation many incluye MEMORY snippet.
- Typecheck.

## Criterios de aceptación

- `project-memory.cjs` tiene al menos un caller real.
- Comportamiento `memoryEnabled` coherente UI ↔ prompt ↔ tools.
- Docs de frontera publicadas.

## STOP conditions

No migrar LTM a SQLite en este plan. No cambiar algoritmo de compaction del harness salvo bugs de wiring.

## Mantenimiento

Cualquier nueva superficie agente debe usar `loadAgentMemoryContext`, no leer SOUL a mano.
