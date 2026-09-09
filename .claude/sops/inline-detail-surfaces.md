# SOP: Entity detail modals

Updated 2026-09-09 by explicit product direction: entity details use the Social publication modal pattern throughout Dome.

## Shared composition

Use `app/components/shared/DetailModal.tsx` for record details. It composes the existing shadcn/Base UI Dialog with a compact header, bounded height, scrollable content and persistent actions.

- `size="compact"`: short forms, calendar events and simple records; reduced height.
- `size="reading"`: documents, reports, objectives and catalog entries.
- `size="wide"`: media, email readers and tasks with substantial context.
- `DetailColumns`: primary description or document plus contextual metadata. Stack at narrow widths; `fill` bounds independent desktop scrolling for readers.
- `bare`: domain content provides its own header and scrolling. Use `DetailModalClose` in that header, or `HubDetailPane` which already provides it.
- Existing `InlineDetailCard` callers delegate to this same modal. New callers should compose `DetailModal` directly.

## Rules

1. Opening a detail must not resize, hide, replace or reset its source list, dashboard or calendar. Remove the old side-column wrapper.
2. Open on explicit selection, never automatically on the first item. Clear the selection on close and invalidate pending detail requests.
3. One identity header. Put long descriptions in the body, contextual metadata in a secondary column, and actions in the footer. Keep the author, title, status and close control readable.
4. Use the domain's useful tabs: comments/activity for tasks, identity/history for people, preview/comments/notes for Social.
5. Use existing dirty-form guards for explicit close/Escape. Backdrop dismissal is disabled by default for editing surfaces; opt in for pure readers.
6. Keep Base UI focus trapping and nested dialogs. Confirmations and pickers must return to the originating detail without losing form state.
7. When an action opens Many or another workspace, close the detail so the destination is accessible.
8. No custom Node access, new windows or new modal primitives. Use semantic color tokens and translated labels.
9. Workspace navigation and active conversation/editor panels are workspaces, not entity details; keep their established behavior.

## Validation

- Open and close with keyboard and button; return focus to the source.
- Long content, narrow windows, loading/error/empty states.
- Edit/save and nested confirmation cancel preserve the record.
- Source list size and scroll remain unchanged.
- Typecheck, renderer regressions, lint, build and UI contracts.

## References

- Shared implementation: `app/components/shared/DetailModal.tsx`
- Social media: `app/components/social/workspace/SocialContentHub.tsx`
- Mail reader: `app/components/email/MailDetailPanel.tsx`
- Seguimiento: `app/components/github/IssueDetailPanel.tsx`
- [shadcn-ui.md](./shadcn-ui.md)
