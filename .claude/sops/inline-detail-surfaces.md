# SOP: Inline detail surfaces (master–detail)

Use this when redesigning a Dome hub/list screen so detail does **not** cover the list with Sheet/Drawer/Dialog. Canonical examples: Calendar (`EventDetailChrome` + `CalendarPage`), Seguimiento (`IssueDetailChrome` + `GitHubView`).

Shared chrome: [`app/components/shared/InlineDetailCard.tsx`](../../app/components/shared/InlineDetailCard.tsx).

---

## Rules

1. **Master–detail inline** — Page is `flex` → main `flex-1 min-w-0` + detail column `md:w-72 lg:w-96` (or `lg:w-[28rem]` if dense). When detail opens, **replace** the secondary aside (Upcoming / feed / empty) — do not stack three columns or overlay.

2. **Forbidden for primary detail** — `Sheet` / `Drawer` / centered `Dialog` that covers the list. **Allowed exceptions:** destructive `AlertDialog`, one-shot pickers (`ResourcePicker`, Command palette), OAuth/connect flows.

3. **Chrome** — Compose in `app/components/shared/` via `InlineDetailCard` (Card + close + scroll body + footer). Domain wrappers (`EventDetailChrome`, `IssueDetailChrome`) only — never `*V2` / deprecated aliases.

4. **Identity with pills** — shadcn `Badge` / `ColorPill`; entity color via `style={{ backgroundColor }}` or variant. **Never** a top gradient/accent strip. Override Badge clip: `h-auto overflow-visible leading-none [&_svg]:size-2.5` (base `h-5 overflow-hidden` clips icons).

5. **Clickable rows** — Do not put title + meta (labels) as siblings inside a `Button` with default `inline-flex` without `flex-col`. Prefer: title button + pills as siblings below; always `text-foreground` on titles.

6. **Inline forms** — Create/edit in the Card/column, not a Dialog. Use Field / Input / Select / DateTimePicker. When changing start time, auto-bump end if `end <= start`.

---

## Checklist for a new `plans/0xx` redesign

Copy into the plan before implementation:

- [ ] Inventory of Sheet / Dialog / Drawer on the surface
- [ ] Which secondary column is hidden when detail opens
- [ ] List of pills / labels / status chips
- [ ] Smoke: open/close detail, create, destructive confirm
- [ ] `pnpm run typecheck`

---

## Related

- [shadcn-ui.md](./shadcn-ui.md) — primitives vs shared compositions
- Calendar: `app/components/calendar/EventDetailChrome.tsx`, `app/pages/CalendarPage.tsx`
- GitHub: `app/components/github/IssueDetailChrome.tsx`, `app/components/github/GitHubView.tsx`
