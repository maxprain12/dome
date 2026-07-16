# Plan 019: Event detail as DetailSheet (shadcn) with drawer motion

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If anything in STOP conditions occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> ```bash
> git diff --stat 52139a57..HEAD -- \
>   app/components/calendar/EventModal.tsx \
>   app/components/shared/DetailSheet.tsx \
>   app/components/shared/DetailDrawer.tsx \
>   app/components/ui/sheet.tsx \
>   app/pages/CalendarPage.tsx \
>   packages/i18n/locales/en/calendarPage.json
> ```
> If any in-scope file changed since `52139a57`, compare the "Current state" excerpts against live code before proceeding; on mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (calendar EventModal already has resource links + open actions)
- **Category**: direction (UI craft) + motion cohesion
- **Planned at**: commit `52139a57`, 2026-07-16
- **Status note**: DONE then pivoted — EventDetailChrome is an inline column (no Sheet overlay); see CalendarPage layout

## Why this matters

Calendar event surfaces today open as three different centered `Dialog` shells (GitHub / read-only local / edit form). They feel like generic forms, not calendar cards: no color accent from `calendar_color`, cramped `sm:max-w-md` / `sm:max-w-2xl` dialogs, and dense `dl` grids. Dome already has a Codex-style detail pattern (`DetailSheet` / `DetailDrawer`) used elsewhere — calendar should use that, with a right-edge sheet that keeps the grid visible underneath and motion that matches Dome’s drawer tokens (`--ease-drawer`, `--duration-drawer`).

## Current state

### Files

- `app/components/calendar/EventModal.tsx` (~960 LOC) — single default export; three early-return Dialog trees (GitHub, detail, form). Contains `LocalEventDetail`, `GithubEventBody`, resource linking, open GitHub/pipeline/social.
- `app/pages/CalendarPage.tsx` — mounts `<EventModal … />` when `showModal`.
- `app/components/shared/DetailSheet.tsx` — **exemplar**: Sheet-based detail chrome (`DetailSheetHeader`, `DetailSheetBody`, `DetailSheetFooter`, `DetailSheetMetaGrid`, `DetailSheetSection`, `DetailSheetPanel`, sizes `sm|md|lg|xl`).
- `app/components/shared/DetailDrawer.tsx` — same API for swipe Drawer (use on narrow / bottom sheet).
- `app/components/ui/sheet.tsx` — Base UI sheet; right-side slide currently uses `duration-200 ease-in-out` and only `translate-x-[2.5rem]` (weak).
- `app/globals.css` — motion tokens already defined:

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
--duration-overlay: 250ms;
--duration-drawer: 450ms;
```

### Excerpt — EventModal still Dialog-based (GitHub branch)

```tsx
// app/components/calendar/EventModal.tsx (~735)
if (githubEvent && event) {
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="flex max-h-[min(90vh,640px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        …
      </DialogContent>
    </Dialog>
  );
}
```

### Excerpt — DetailSheet exemplar to imitate

```tsx
// app/components/shared/DetailSheet.tsx:32-68
export function DetailSheet({ open, onOpenChange, children }: DetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {children}
    </Sheet>
  );
}
export function DetailSheetContent({ size = 'md', className, children, showCloseButton = true }: …) {
  return (
    <SheetContent
      showCloseButton={false}
      className={cn('h-full w-full gap-0 p-0', contentWidthClass[size], className)}
    >
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      …
    </SheetContent>
  );
}
```

### Conventions

- shadcn only in `app/components/ui/`; compositions in `app/components/shared/` (see `.claude/sops/shadcn-ui.md`).
- No `*V2` / deprecated re-exports — replace `EventModal` in place or rename file only after migrating the single caller (`CalendarPage`).
- i18n keys in `packages/i18n/locales/{en,es,fr,pt}/calendarPage.json`.
- Icons: Hugeicons. Prefer `DetailSheet*` over hand-rolled Dialog chrome.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `pnpm run typecheck` | exit 0 |
| Lint (optional) | `pnpm run lint` | exit 0 (or pre-existing warnings only) |
| Unit (if any) | `pnpm exec vitest run app/components/calendar` | pass or no tests yet |

## Suggested executor toolkit

- If available: Dome `shadcn` skill / `.claude/sops/shadcn-ui.md` before inventing new primitives.
- Do **not** add Framer Motion / new deps. CSS + existing Sheet/Drawer only.

## Scope

**In scope**

- `app/components/calendar/EventModal.tsx` (rewrite shell; may split helpers into sibling files under `app/components/calendar/`)
- Optional new files (only if needed for readability, same folder):
  - `app/components/calendar/EventDetailChrome.tsx` — shared DetailSheet wrapper + accent bar
  - `app/components/calendar/EventGithubBody.tsx` — move `GithubEventBody`
  - `app/components/calendar/EventLocalDetail.tsx` — move `LocalEventDetail`
- `app/pages/CalendarPage.tsx` — only if import path / props rename
- `app/components/ui/sheet.tsx` — motion token fix only (easing/duration/translate strength)
- `packages/i18n/locales/{en,es,fr,pt}/calendarPage.json` — any new copy keys
- `docs/features/calendar.md` — one short paragraph on event detail surface
- `plans/README.md` — status row

**Out of scope**

- Calendar grid / year / month views (`CalendarGrid*`, `CalendarYearView`).
- IPC / `calendar-service` / resourceIds merge logic (already shipped).
- Changing `DetailSheet` / `DetailDrawer` public API unless a tiny additive prop is required (prefer not).
- Adding `vaul` / new animation libraries.
- Dashboard calendar widget.

## Git workflow

- Branch: stay on current feature branch or `feat/calendar-event-detail-sheet`.
- Commit style (from recent log): `feat(calendar): …` / `fix(ui): …`
- Do NOT push or open a PR unless the operator asks.

## Design target (visual + IA)

One shell for all three modes (GitHub detail, local detail, create/edit):

```
DetailSheet (right, size=lg for GitHub markdown; md otherwise)
├── Accent strip (4px) using event.calendar_color ?? var(--primary)
├── DetailSheetHeader
│     icon: Calendar03 / Github / Workflow / Share badge circle
│     title: event title or "New event"
│     description: formatted when (reuse formatEventWhen)
│     badges: source badges (GitHub / Pipeline / Social / All-day)
├── DetailSheetBody (ScrollArea optional)
│     DetailSheetMetaGrid — when, location, calendar name
│     DetailSheetSection — description / GithubMarkdownBody
│     DetailSheetSection — linked resources (existing chips)
│     DetailSheetSection — integration actions (open in …)
│     OR form fields when editing/creating
└── DetailSheetFooter — delete / edit / save / close (same actions as today)
```

**Responsive**: `DetailSheet` on all widths is OK (Sheet already goes nearly full width on small screens). Do **not** require a second code path with DetailDrawer unless Sheet breaks scroll on iOS — then STOP and report.

**Preserve behavior**: resourceIds picker, open GitHub/pipeline/social/resource tabs, HITL-irrelevant local create/update/delete props, AlertDialog delete confirm.

## Motion target

### Step A — fix Sheet entrance globally (cohesion)

In `app/components/ui/sheet.tsx` `SheetContent` / overlay classes:

| Current (wrong for enter) | Target |
|---------------------------|--------|
| `duration-200 ease-in-out` on popup | `duration-[var(--duration-drawer)] ease-[var(--ease-drawer)]` |
| Overlay `duration-150` | Overlay `duration-[var(--duration-overlay)] ease-[var(--ease-out)]` |
| `translate-x-[2.5rem]` start/end (right) | Prefer full-edge feel: `translate-x-full` / `-translate-x-full` for left (still opacity fade) |

Do **not** use `scale(0)`. Do **not** add keyframes for open/close — keep CSS transitions / Base UI data-starting-style so open/close stays interruptible.

Respect existing `prefers-reduced-motion` rules in `globals.css` (opacity-only under reduce). After changing sheet.tsx, confirm Many’s right Sheet and RunLog Sheet still open/close cleanly (feel check).

### Step B — Event surface

No extra animation on every keystroke in the form. Optional: when switching detail → edit inside the same sheet, crossfade body with opacity only (`transition-opacity duration-[var(--duration-popover)] ease-[var(--ease-out)]`) — never layout width/height animation.

## Steps

### Step 1: Drift check + inventory

Run the drift check command above. List the three Dialog return sites in `EventModal.tsx` and confirm `CalendarPage` is the only importer:

```bash
rg -n "EventModal|from '@/components/calendar/EventModal'" app --glob '*.{ts,tsx}'
```

**Verify**: only `CalendarPage.tsx` imports the modal.

### Step 2: Sheet motion tokens

Edit `app/components/ui/sheet.tsx` as in Motion target A. Keep Base UI `data-starting-style` / `data-ending-style` pattern.

**Verify**: `pnpm run typecheck` exit 0. Manually open Many panel Sheet + a Sheet elsewhere — slide uses drawer ease, not sluggish ease-in-out.

### Step 3: Introduce `EventDetailChrome`

Create `app/components/calendar/EventDetailChrome.tsx` that wraps:

```tsx
<DetailSheet open onOpenChange={(o) => { if (!o) onClose(); }}>
  <DetailSheetContent size={size} className="…">
    <div aria-hidden className="h-1 w-full shrink-0" style={{ backgroundColor: accent }} />
    <DetailSheetHeader … />
    <DetailSheetBody>{children}</DetailSheetBody>
    <DetailSheetFooter>{footer}</DetailSheetFooter>
  </DetailSheetContent>
</DetailSheet>
```

Props: `onClose`, `title`, `description?`, `accent?: string`, `icon?`, `badges?`, `size?: 'md' | 'lg'`, `footer`, `children`.

**Verify**: file compiles; no circular imports.

### Step 4: Re-shell the three EventModal modes

Replace each `Dialog`/`DialogContent` tree with `EventDetailChrome`:

| Mode | size | accent | notes |
|------|------|--------|-------|
| GitHub detail | `lg` | `event.calendar_color` or GitHub-ish primary | Keep `GithubEventBody`; footer actions unchanged |
| Local detail | `md` | `event.calendar_color` | Use `DetailSheetMetaGrid` instead of custom `MetaRow` dl where straightforward |
| Create / edit form | `md` | `var(--primary)` or selected calendar color if available | Form fields stay; ResourcePickerModal stays portaled |

Keep the public props of `EventModal` identical so `CalendarPage` needs no logic change.

**Verify**: `pnpm run typecheck` exit 0. `rg "DialogContent" app/components/calendar/EventModal.tsx` → no matches (AlertDialog for delete may remain).

### Step 5: Polish content hierarchy

- Header description = `formatEventWhen(event, locale)` for detail modes.
- Badges for `all_day`, `metadata.source` (github/pipeline/social).
- Linked resources stay in a `DetailSheetSection` labeled with `calendarPage.linked_resources`.
- Integration buttons use `Button variant="outline" size="sm"` in a row (already present).

Add i18n keys only if new strings appear; otherwise reuse existing `calendarPage.*`.

**Verify**: open create, local event, GitHub event, pipeline event in the app — sheet from the right, accent strip visible when `calendar_color` exists, actions still work.

### Step 6: Docs + index

Update `docs/features/calendar.md` UI table: EventModal → DetailSheet-based event detail. Set this plan’s row to DONE in `plans/README.md`.

**Verify**: docs mention DetailSheet; README status DONE.

## Test plan

- No mandatory new unit test if none exist for EventModal. Prefer a thin smoke test only if the repo already tests dialog shells nearby.
- Manual cases (must all pass):
  1. Create event → save → appears on grid; sheet closes.
  2. Open local event → Edit → Save; resource chip add/remove persists.
  3. Open GitHub-sourced event → “Open in GitHub” + external URL.
  4. Pipeline / Social badges + open actions.
  5. Delete with AlertDialog confirm.
  6. `prefers-reduced-motion: reduce` → sheet still usable (opacity ok; no long slide required).
  7. Spam Esc / overlay click while opening — no stuck overlay (interruptible transition).

## Done criteria

- [ ] `pnpm run typecheck` exits 0
- [ ] `EventModal` no longer uses `Dialog`/`DialogContent` for the three main shells (AlertDialog delete OK)
- [ ] Event UI uses `DetailSheet` + `EventDetailChrome` (or equivalent) with color accent strip
- [ ] `sheet.tsx` uses `--ease-drawer` / `--duration-drawer` (or overlay tokens) — not bare `ease-in-out` + `duration-200`
- [ ] `CalendarPage` still mounts one event surface; create/update/delete/resourceIds behavior unchanged
- [ ] No files outside Scope modified (`git status`)
- [ ] `plans/README.md` row 019 → DONE

## STOP conditions

- `DetailSheet` / Sheet API drifted and cannot host sticky footer + scroll body without changing Base UI primitives.
- Fixing Sheet motion breaks Many / RunLog overlays (report; revert sheet.tsx and scope motion override to calendar chrome only).
- EventModal has grown new Dialog callers outside CalendarPage.
- GitHub markdown body requires >`xl` width and breaks layout — report before inventing a second modal type.

## Maintenance notes

- Reviewers: ensure delete still uses AlertDialog (destructive confirm), and resource picker does not unmount under the sheet incorrectly.
- Future: day-cell popovers could open the same `EventDetailChrome` instead of a second Dialog.
- Deferred: deep-link to a specific GitHub issue tab (today opens GitHub hub tab only).

## Feel check (motion)

- Open event from month grid: sheet enters from the **right** in ≤450ms, strong ease-out/drawer curve (starts quick).
- Close via overlay / Esc: exits with the same curve; no ease-in sluggishness.
- DevTools Animations at 10%: confirm transform+opacity only (no width/height).
- Reduced motion: movement minimized; sheet still appears and is operable.
