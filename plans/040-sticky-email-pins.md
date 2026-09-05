# Plan 040: Rehidratar pins del turno anterior + tab Correo en UI context

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 94211348..HEAD -- app/lib/many/useManySend.ts app/lib/ai/shared-capabilities.ts app/lib/personality/domainMemory.ts app/lib/store/useManyStore.ts`
> If excerpts in "Current state" no longer match, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/039-canonical-email-pin.md
- **Category**: bug
- **Planned at**: commit `94211348`, 2026-09-04

## Why this matters

`clearPinnedResources()` runs on every send so chips do not ride silently. Hydration only sees the composer pins. The next user message («¿qué correos le envié?») has an empty composer, so `mentioned-sources` is empty even though JSONL / the previous user bubble had the email. Observed 2026-09-04: run `0cf7489f` saw the pin; run `eb8353bf` did 14 searches and never `email_read`.

Separately, `getUiLocationDescription` / `buildSharedUiContextBlock` ignore `shellTabType === 'email'` while `resolveMemoryDomains` already treats that tab as domain `email`. Many does not know the user is in Correo.

## Current state

`app/lib/many/useManySend.ts` 254–258, 299–301, 388–392:

```ts
const pinSnapshot = pinnedResources.map((r) => ({
  id: r.id, title: r.title, type: r.type, kind: r.kind ?? ('resource' as const),
  // after 039 this also has meta
}));
// ...
useManyStore.getState().clearPinnedResources();
// ...
const hydrated = await hydratePinnedContext(pinnedResources); // composer only
```

`ManyMessage.pinnedResources` — after 039 includes `meta`. Messages live in `useManyStore` (`messages` for the current session).

`app/lib/ai/shared-capabilities.ts` 58–128 — `getUiLocationDescription` handles `projects` and `agents|workflows|automations|runs`. `buildSharedUiContextBlock` only emits a shell-tab line for `projects | agents | workflows | automations | runs | home`. No `email`.

`app/lib/personality/domainMemory.ts` 13–15 already: `if (tab === 'email') out.add('email')`. Tests: `app/lib/personality/domainMemory.test.ts`.

Do **not** auto-pin every selected inbox row (that is a later direction spike). This plan only: (1) reuse last-turn pins when the composer is empty; (2) tell Many the Correo tab is focused.

**Convention**: keep the comment in `useManySend` — pins must not stay in the composer after send. Sticky context is hydration-only, not a leftover chip unless the user pins again.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Helper tests | `pnpm exec vitest run --config vitest.renderer.config.ts app/lib/many/lastTurnPins.test.ts app/lib/ai/shared-capabilities.test.ts` | exit 0 (create files as needed) |
| Domain memory | `pnpm exec vitest run --config vitest.renderer.config.ts app/lib/personality/domainMemory.test.ts` | exit 0 |
| Typecheck | `pnpm run typecheck` | exit 0 |

If `shared-capabilities.test.ts` does not exist, create it next to the module (same style as `domainMemory.test.ts`).

## Scope

**In scope**:
- `app/lib/many/useManySend.ts`
- `app/lib/many/lastTurnPins.ts` (create — pure helper)
- `app/lib/many/lastTurnPins.test.ts` (create)
- `app/lib/ai/shared-capabilities.ts`
- `app/lib/ai/shared-capabilities.test.ts` (create if missing)
- i18n: none (UI context is English prompt text, matching existing `buildSharedUiContextBlock`)

**Out of scope**:
- Auto-pin on inbox selection / `activeEmail` store
- Changing `clearPinnedResources` timing so chips remain visible (do not)
- email tool prompt / thread search (041)
- Multi-account (042)
- `electron/` except you must not touch it

## Git workflow

- Branch: `feat/040-sticky-email-pins` (from main, or stacked on 039 if 039 is not merged)
- Commit: `fix: rehydrate last-turn email pins for Many`
- Do NOT push unless asked.

## Steps

### Step 1: Pure helper `resolvePinsForHydration`

Create `app/lib/many/lastTurnPins.ts`:

```ts
export function resolvePinsForHydration(
  composerPins: PinnedResource[],
  recentMessages: Array<{ role?: string; pinnedResources?: PinnedResource[] | null }>,
): PinnedResource[]
```

Rules:
- If `composerPins.length > 0`, return `composerPins` unchanged.
- Else walk `recentMessages` from the end; first `role === 'user'` with `pinnedResources?.length` wins.
- Keep at most **one** email pin (the last email in that snapshot) plus any non-email pins from that same snapshot (people/docs), cap total pins at 4.
- Return `[]` if nothing found.

**Verify**: new unit tests — composer wins; empty composer uses last user pins; no user pins → `[]`; two emails in snapshot → only the last email kept.

### Step 2: Wire helper in `handleSend`

After 039, `pinSnapshot` still comes from composer (for the message being sent). Hydration must use:

```ts
const pinsForHydration = resolvePinsForHydration(pinnedResources, messages);
const hydrated = await hydratePinnedContext(pinsForHydration);
```

Do not put sticky pins back into `pinSnapshot` / `addMessage` unless they were in the composer (otherwise every follow-up duplicates `dome.pins`).

Keep `clearPinnedResources()` as-is.

**Verify**: `pnpm run typecheck` → 0.

### Step 3: Correo in UI context

In `getUiLocationDescription`, before the Home/`pathname` fallbacks, if `shellTabType === 'email'`:

```ts
return { location: 'Email', description: 'triaging the inbox or reading a message in the Email tab' };
```

In `buildSharedUiContextBlock`, include `'email'` in the shell-tab allow-list (same line style as `home`). Optionally add `github` / `social` **only if** they are one-line additions in the same allow-list; do not redesign those surfaces.

Add a test that `shellTabType: 'email'` appears in the returned strings.

**Verify**: vitest commands in the table → all pass.

## Test plan

- `lastTurnPins.test.ts` — cases in Step 1.
- `shared-capabilities.test.ts` — email tab location + context block contains `email`.
- Existing `domainMemory.test.ts` still passes (email from tab already covered indirectly; add `shellTabType: 'email'` → `['email']` if missing).

## Done criteria

- [ ] Composer empty + previous user had an email pin → `hydratePinnedContext` is called with that pin
- [ ] Composer non-empty → composer pins only
- [ ] Follow-up turns do not append a new `dome.pins` unless the user pinned again
- [ ] `getUiLocationDescription` / `buildSharedUiContextBlock` mention Email when `shellTabType === 'email'`
- [ ] Tests + typecheck listed above pass
- [ ] No files outside Scope
- [ ] `plans/README.md` row 040 → DONE

## STOP conditions

- 039 has not landed and `pinnedResources` on messages still has no `meta` — implement the helper anyway (id-only pins still hydrate via `emsg-` / uid fallback) but STOP if types do not compile without widening `ManyMessage` (that widening belongs to 039).
- You believe you must keep chips in the composer to make hydration work — STOP; that contradicts the existing comment at `useManySend.ts:299-301`.

## Maintenance notes

- Token budget: one email body is already clipped in `hydratePinnedContext` (`BODY_MAX = 2000`). Do not raise it here.
- 041 assumes `mentioned-sources` can still list the pin on follow-up turns after this plan.
- Reviewer: no auto-pin of the open inbox row.
