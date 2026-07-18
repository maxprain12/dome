# Plan 008 — Many: intents + sugerencias visuales

**Estado:** DONE · **Prioridad:** P0 · **Esfuerzo:** XL  
**Depende de:** 007, 017

## Objetivo

Que Many entienda intents como “crea un issue para @maxprain”, “envía correo a @alder”, “crea un post…”, muestre sugerencias visuales (chips/cards) basadas en APIs (GitHub mentionables, people, draft email/post) y ejecute tools con assignee/recipient correctos.

## Drift check

- Send path: [`useManySend.ts`](../app/lib/many/useManySend.ts), [`agent-runtime.cjs`](../electron/agents/agent-runtime.cjs)
- Tools: github / email / social domain prompts en [`packages/tools/src/domains/`](../packages/tools/src/domains/)
- Composer chips: [`ManyComposerChips.tsx`](../app/components/many/composer/ManyComposerChips.tsx)
- Memoria de acción: 017 (domain remember_fact + hooks)

## Diseño destino

1. **Resolución de mención en prompt:** bloque `mentioned-people` con identities.
2. **Suggestion UI:** tras detectar intent (heurística en renderer o tool `propose_action`), mostrar card inline:
   - GitHub: repo, título draft, assignees from people→github login
   - Email: to, subject draft
   - Social: network, caption draft
3. Confirmación ligera (Approve en card) o ejecución directa si HITL no requiere.
4. Post-acción: 017 escribe memoria relevante.

## Implementación

1. Extender system prompt / volatile context con people mencionados.
2. Actualizar `github/prompt.txt`, `email/prompt.txt`, `social/prompt.txt`: reglas de assignee/to/handle desde identities.
3. Componente `ManyActionSuggestion` en conversation (estilo Codex card limpia).
4. Wire tool results → suggestion cards cuando el modelo emite estructura conocida (o tool dedicado `ui_suggest_action`).
5. Tests de resolución person→github login / email address.

## Validación

- Fixture: person con github identity → create issue tool args incluyen assignee.
- Typecheck + lint.
- Smoke UI suggestion dismiss/confirm.

## Criterios de aceptación

- “issue para @X” no pide login si identity github existe.
- “correo a @Y” usa email identity; si falta, pregunta una vez.
- Sugerencias visuales no bloquean el stream de texto.

## STOP conditions

No inventar OAuth scopes nuevos en este plan. Si falta permiso GitHub assign, degradar a comentario “assignee sugerido” en body.

## Mantenimiento

Nuevos intents → prompt domain + card renderer + test de resolución.
