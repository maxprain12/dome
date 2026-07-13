# Plan 011: Chat styling — Switch, Empty, space-y, transition-all

> **Drift check**: `git diff --stat b500063c..HEAD -- app/components/chat/ app/components/common/copy-button/`

## Status

- **Priority**: P2 | **Effort**: S | **Risk**: LOW | **Depends on**: 010 | **Planned at**: `b500063c`

## Why this matters

Violaciones shadcn puntuales en chat: ChatInputToggle artesanal, UnifiedChatEmptyState sin Empty, space-y-*, transition-all, CopyButton sin error handling.

## Steps

1. `ChatInputToggle.tsx` → `@/components/ui/switch` en CapabilityToggleRow
2. `UnifiedChatEmptyState.tsx` → `Empty` + `EmptyHeader` + Avatar fallback
3. `ChatMessageGroup.tsx` avatars → `Avatar`/`AvatarImage`/`AvatarFallback`
4. Reemplazar `space-y-*` por `flex flex-col gap-*` en McpCapabilitiesSection, ChatMessage, CalendarFlashcardArtifacts
5. `AIComposer.tsx:217` — `transition-all` → `transition-colors duration-150`
6. `source-reference.css:55` — explicit properties
7. `copy-button/index.tsx` — `.catch()` + toast; `text-teal-600` → token; iconos con data-icon

**Verify**: `pnpm run lint` exit 0

## Done criteria

- [ ] 0 Switch artesanal en chat/
- [ ] UnifiedChatEmptyState usa Empty
- [ ] CopyButton maneja error clipboard
