# Plan 021: GitHub + pipelines + studio — shadcn batch

> **Drift check**: `git diff --stat b500063c..HEAD -- app/components/github/ app/components/pipelines/ app/components/studio/`

## Status

- **Priority**: P2 | **Effort**: L | **Planned at**: `b500063c`

## Why this matters

github/pipelines usan botones inline masivos; IssueDetailPanel dropdown/tabs manuales; studio FAQ sin i18n.

## Steps

1. IssueDetailPanel assignee dropdown → Popover + Command
2. IssueDetailPanel tabs → Tabs shadcn
3. FAQ.tsx → Collapsible + i18n keys (4 langs)
4. MentionTextarea → ui/Textarea + i18n (mantener createPortal caret)
5. Batch Button migration en github/pipelines — priorizar KanbanBoard, IssueDetailPanel, PipelineCard (no bloquear en 20 archivos de una vez; PR puede ser 2 commits)

**Verify**: GitHub issue detail assignee filter funciona

## Done criteria

- [ ] IssueDetailPanel usa Tabs shadcn
- [ ] FAQ strings en i18n.ts
- [ ] ≥5 archivos github migrados a Button (documentar resto como follow-up en README si L excede PR)

## STOP conditions

- PR >40 archivos → dividir en 021a (IssueDetailPanel+FAQ) y 021b (button batch)
