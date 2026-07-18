# Plan 033: Full-app visual sweep onto brand system

> **Status**: DONE  
> **Planned at**: `3ef2723a`  
> **Depends on**: 030–032  
> **Category**: direction / design-system

## What landed

- `DomainStatChips` pills + mint active
- Mail/Tracking stat cards `variant="lime"` when active
- Empty states: mint icon circle + `text-brand-h3`
- Hub badges (GitHub/Social sync, Social posts, Calendar, Learn) → brand badge variants
- InlineDetailCard / Pipelines icon treatments
- DocumentToolbar / ResourceCard / Bubble secondary → brand tokens
- Remaining surfaces inherit via CSS tokens + pill Button globally

## Verify

- `pnpm run typecheck` · smoke light/dark hubs + Settings
