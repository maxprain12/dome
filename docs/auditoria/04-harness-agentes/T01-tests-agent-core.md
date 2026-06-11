# T01 — Suite de tests para @dome/agent-core

**Prioridad**: P0 · **Severidad**: Crítica · **Esfuerzo**: L · **Área**: Harness
**Estado**: ✅ Implementada (2026-06-10) — **39 tests** en `packages/agent-core/test/`: `agent-loop.test.ts` (18: turnos simples, error/aborted, tools secuencial+paralelo, tool desconocida, validación de argumentos, tool que lanza, terminate, hooks before/after/shouldStop/transformContext, steering, follow-up, continue-mode) con **mock de streamFn guionizado**; `compaction.test.ts` (8: shouldCompact, estimateContextTokens con/sin usage, primitivas); `skills.test.ts` (7: loadSkills válidos/corruptos/dir inexistente, formatSkillsForSystemPrompt). Todo en verde y ejecutándose en CI. La parte HITL del lado Dome se cubre en `electron/__tests__/tool-call-policy.test.mjs` (gate beforeToolCall, 8 tests). Pendiente (fase 2): tests de Session/JSONL storage y de `topologicalLevels` del run-engine.

## Problema

`packages/agent-core` (~2.130 líneas TS: harness loop, session, compaction, skills) tiene **un solo test de 18 líneas** (`test/types.test.ts`) y su script de test es:

```json
"test": "echo \"@dome/agent-core: no tests yet\" && exit 0"
```

Es el corazón de Many, agent-chat, agent-team, workflows y automations. Cualquier cambio a compaction, serialización de sesión, retry o al loop de tools se hace a ciegas y solo se detecta en producción.

## Qué hay que hacer

1. **Infra**: añadir vitest a `packages/agent-core` (devDependency del package, config mínima). Los packages son TS puro sin Electron, así que los tests corren en Node sin fricción.
2. **Mock de modelo**: un fake del cliente LLM que emite secuencias guionizadas de chunks (texto, tool_use, error, stream cortado). Es la pieza clave: permite testear el loop sin red.
3. **Suites prioritarias** (en orden de valor):
   - **Harness loop** (`src/harness/`): texto simple; 1 tool call → resultado → respuesta; múltiples tools en un turno; tool con argumentos inválidos (validación + reintento del modelo); error de tool propagado como tool_result de error; abort a mitad de stream (no deja estado corrupto); límite de iteraciones.
   - **Session**: serializar → deserializar → continuar produce el mismo contexto; mensajes con tool_use/tool_result pareados tras restore.
   - **Compaction**: conversación larga → compactada conserva system prompt, últimos N mensajes y resumen; falla de compaction no rompe el run (fallback).
   - **HITL**: tool gated lanza la interrupción correcta; resume con approve ejecuta la tool; resume con deny inyecta el rechazo y el loop continúa.
   - **Skills**: `loadSkills` con SKILL.md válidos/corruptos; `formatSkillsForSystemPrompt`.
4. **Tests del lado Electron** (segunda fase, pueden ser pocos): `run-engine.cjs` — orden topológico de `topologicalLevels` con DAGs de prueba (diamante, niveles paralelos, ciclo → error), y la lógica de retry. Son funciones casi puras: extraerlas si hace falta para testearlas.
5. Conectar todo al job de CI ([06/T01](../06-calidad-observabilidad/T01-tests-en-ci.md)).

## Criterios de aceptación

- [ ] `pnpm --filter @dome/agent-core test` ejecuta una suite real (≥25 tests significativos) y falla si algo se rompe.
- [ ] Cobertura de los 5 bloques listados (loop, session, compaction, HITL, skills).
- [ ] `topologicalLevels` del run-engine testeado con al menos 4 topologías.
- [ ] CI ejecuta los tests.

## Riesgos / notas

- No perseguir % de cobertura: perseguir los caminos que han dado sustos (compaction, resume, abort).
- Si el código del harness no es inyectable (cliente LLM hardcodeado), el primer paso es introducir el seam de inyección — cambio pequeño y seguro.
