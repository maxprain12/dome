# Plan 020: Misc overlays — email, cloud, user, transcription, agents pickers

> **Drift check**: `git diff --stat b500063c..HEAD -- app/components/email/EmailView.tsx app/components/cloud/ app/components/user/ app/components/transcription/ app/components/agents/AgentChatInput.tsx`

## Status

- **Priority**: P1 | **Effort**: M | **Depends on**: 008 | **Planned at**: `b500063c`

## Why this matters

Overlays artesanales en features misc: EmailView folder menu, CloudFilePicker dialog nativo, UserMenu dropdown, transcription z-[9999], AgentChatInput pickers duplicando ComposerFloatingPicker.

## Steps

1. EmailView folder menu → DropdownMenu (eliminar createPortal :567-603)
2. CloudFilePicker, MarketplaceAgentDetail, WorkflowDetail → Dialog/Sheet
3. UserMenu → DropdownMenu; quitar ring-blue-500
4. StartTranscriptionPopover, LivePreviewPanel → Popover; eliminar z-[9999]
5. AgentChatInput slash/mention portals → ComposerFloatingPicker (patrón ManyComposerRichInput fix opcional)
6. AgentTeamChat scroll smooth → instant during streaming (`:83-89`)
7. PetMascot left/top 800ms → transform ≤300ms

**Verify**: email folder menu dismiss; transcription popover stacking correcto

## Done criteria

- [ ] EmailView 0 createPortal para folder menu
- [ ] UserMenu usa DropdownMenu
- [ ] transcription sin z-[9999]
