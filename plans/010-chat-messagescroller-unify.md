# Plan 010: Chat — MessageScroller unificado + eliminar layout legacy

> **Drift check**: `git diff --stat b500063c..HEAD -- app/components/chat/ app/components/agents/AgentChatView.tsx app/components/agent-team/AgentTeamChat.tsx app/lib/chat/useChatAutoScroll.ts`

## Status

- **Priority**: P1 | **Effort**: L | **Risk**: HIGH | **Depends on**: 004 | **Planned at**: `b500063c`

## Why this matters

Agent/team chat usa scroll manual (`UnifiedChatMessages` + `useChatAutoScroll`) mientras Many ya usa `MessageScroller`. `ChatMessage` mantiene dos layouts (`layout='shadcn'` vs legacy); Many fuerza legacy (`ChatMessageGroup.tsx:89`).

## Current state

- `ManyMessageThread.tsx:71-83` — MessageScroller (correcto)
- `AgentChatView.tsx:672-675` — div overflow-y-auto + useChatAutoScroll
- `ChatMessage.tsx:290-686` — dual layout branches
- `ChatMessageGroup.tsx:47-99` — flex manual, no Message/MessageGroup

## Scope

**In scope:** AgentChatView, AgentTeamChat, ChatMessage, ChatMessageGroup, UnifiedChatMessages, useChatAutoScroll (delete if unused)

**Out of scope:** Many panel (ya migrado salvo layout legacy en group)

## Steps

### Step 1: Migrar AgentChatView a MessageScroller

Wrap messages en `MessageScrollerProvider` + `MessageScroller` + `MessageScrollerButton`. Usar `MessageScrollerItem` per message group.

### Step 2: Unificar ChatMessage en Bubble-only

Eliminar prop `layout` y rama legacy `:431-686`. Todo pasa por `Bubble`/`Message` components.

### Step 3: ChatMessageGroup → MessageGroup

Usar `Message`, `MessageAvatar`, `MessageFooter` de `@/components/ui/message`.

### Step 4: Many ChatMessageGroup

Quitar `layout='legacy'`; validar visual parity.

### Step 5: Delete useChatAutoScroll if no consumers

**Verify**: `grep useChatAutoScroll app/` → 0

## Done criteria

- [ ] Agent chat tiene jump-to-latest button
- [ ] ChatMessage sin rama legacy
- [ ] `pnpm run typecheck` exit 0
- [ ] Feel-check: streaming scroll stick-to-bottom funciona

## STOP conditions

- Si unificar layout rompe artifacts inline en mensajes → STOP; listar tipos de mensaje afectados.
