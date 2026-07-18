# Plan 017 — Escritura de memoria por acción + relevancia

**Estado:** DONE · **Prioridad:** P0 · **Esfuerzo:** L  
**Depende de:** 015, 016

## Objetivo

Que el agente escriba correctamente en memoria según acciones de alta señal (social/email/github) y relevancia: extender `remember_fact` con `domain`, hooks `afterToolCall` deterministas, y prompts de dominio con reglas claras (preferencias, wins, commitments — no ruido operativo).

## Drift check

- Escritura hoy: solo si el modelo llama `remember_fact` → MEMORY.md + daily ([`ai-tools-handler.cjs`](../electron/tools/ai-tools-handler.cjs))
- **Cero** auto-write desde GitHub/email/social
- Sin ranking de lectura por query (follow-up v1.1)
- `afterToolCall` en harness existe para caps/HITL, no para LTM

## Decisiones cerradas

1. `remember_fact({ key, value, domain?: 'general'|'social'|'email' })` — default `general` → MEMORY.md; social/email → `domains/*.md` (mismo formato `### key`).
2. Hook `afterToolCall` en bridge Electron (lista blanca):
   - social: post publicado, métricas growth relevantes
   - email: correo enviado a VIP / commitment detectado en args
   - github: issue creado/asignado (fact ligero: repo + número + assignee)
3. Filtro relevancia v1 (determinista): tool en whitelist + success + value ≤ N chars + no duplicar misma key en últimas 24h.
4. Prompts social/email: cuándo llamar `remember_fact` (preferencias de tono, hashtags que funcionan, “acordamos follow-up el viernes”); cuándo **no** (cada list folders, cada sync).
5. Sin LLM extra en el hook v1.
6. Lectura ranking por query → documentar como v1.1 (no bloquear).

## Implementación

1. Extender schema tool `remember_fact` en [`packages/tools/src/families/memory.ts`](../packages/tools/src/families/memory.ts) + handler + IPC `personality:remember-fact`.
2. `updateLongTermMemory(key, value, domain)` en personality-loader.
3. Módulo `electron/personality/action-memory.cjs`: `maybePersistFromToolResult(toolName, args, result)`.
4. Registrar en `afterToolCall` del dome-harness-bridge / agent-runtime.
5. Actualizar `social/prompt.txt`, `email/prompt.txt`, `github/prompt.txt`, `role-many.txt`.
6. Tests: whitelist hit/miss, dedup, domain routing.
7. Telemetry/log debug opcional (sin contents sensibles).

## Validación

- Unit tests action-memory.
- Manual: publicar post mock → aparece fact en domains/social.md.
- Typecheck, IPC inventory.

## Criterios de aceptación

- remember_fact con domain escribe el archivo correcto.
- Al menos 3 tools whitelisted persisten en success.
- Prompts documentan do/don't; ruido operativo no llena MEMORY.

## STOP conditions

No persistir bodies de email ni tokens. Si el result de tool es enorme, solo extraer campos allowlisted (id, title, handle, url).

## Mantenimiento

Añadir tool a whitelist = fila en tabla + test + campo extractors. v1.1: ranker de inyección por keywords del user turn.
