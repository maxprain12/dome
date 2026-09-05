# Plan 042: Multi-cuenta — focus + resolve `emsg-` + cuenta activa

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 94211348..HEAD -- app/components/email/EmailView.tsx app/lib/store/useOpenIntentStore.ts electron/email/email-store.cjs electron/email/himalaya-service.cjs`
> If excerpts no longer match, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/039-canonical-email-pin.md (`dbId` / `accountId` on envelopes)
- **Category**: bug
- **Planned at**: commit `94211348`, 2026-09-04

## Why this matters

`focusEmail` already accepts `accountId` (⌘K passes it). `applyEmailFocus` drops it and lists the project default account. `resolveAccountId(null, projectId)` always picks `is_default`. `resolveMessageRef('emsg-…')` returns null when that default account does not own the row — Many/`email_read` then says “Unknown email message id”.

After this plan, opening a mail from ⌘K switches to that account’s folder list, and `emsg-` reads use the row’s `account_id` unless the caller passed an explicit mismatched account.

## Current state

`app/lib/store/useOpenIntentStore.ts` 55–69 — `focusEmail` stores and dispatches `accountId`.

`app/components/email/EmailView.tsx` 634–675 — intent type is `{ sourceId, folder?, uid? }` only. `listEnvelopes({ folder, projectId })` — no `accountId`. Match: `env.dbId === sourceId` or uid.

`EmailView` 332–346 `refreshInbox` — same, no account.

`electron/email/himalaya-service.cjs` 206–222 — `resolveAccountId(accountId, projectId)` default / first in project.

`electron/email/email-store.cjs` 331–341:

```js
if (raw.startsWith('emsg-')) {
  const row = db().prepare(`… WHERE m.id = ?`).get(raw);
  if (!row) return null;
  if (accountId && row.account_id !== accountId) return null;
```

`readMessage` (`himalaya-service.cjs` ~547–551) does `id = resolveAccountId(accountId, projectId)` **before** `resolveMessageRef`, so a missing `accountId` becomes the default account and trips the guard.

`CommandPalette.tsx` 391–396 already passes `accountId` from the hit meta.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Store tests | `node --test electron/__tests__/email-store.test.mjs` | exit 0 |
| Typecheck | `pnpm run typecheck` | exit 0 |
| Lint email UI | `pnpm exec eslint app/components/email/EmailView.tsx` | exit 0 (or project’s lint script) |

## Scope

**In scope**:
- `app/components/email/EmailView.tsx`
- `app/lib/store/useOpenIntentStore.ts` (only if the event detail type must include `accountId` on the listener)
- `electron/email/email-store.cjs` (`resolveMessageRef` only)
- `electron/email/himalaya-service.cjs` (`readMessage` order: resolve ref before forcing default account)
- `electron/__tests__/email-store.test.mjs`
- i18n keys for an account switcher **only if** you add a visible select (four locales: `packages/i18n/locales/{en,es,fr,pt}`)

**Out of scope**:
- Settings account create/delete
- Changing how `is_default` is stored
- Sync scheduler (043)
- Workflow `agent_actions` bypass

## Git workflow

- Branch: `feat/042-email-multi-account`
- Commit: `fix: honor email accountId on focus and emsg reads`
- Do NOT push unless asked.

## Steps

### Step 1: `resolveMessageRef` + `readMessage` order

For `emsg-` refs:
- Load the row by id first.
- If the caller passed `accountId` **and** it differs from `row.account_id`, return null (keep the guard).
- If the caller passed no `accountId`, use `row.account_id`.

In `readMessage`: if `messageId` starts with `emsg-`, call `resolveMessageRef` with the **raw** caller `accountId` (may be null), then set `id` from the resolved row. Do not `resolveAccountId(null)` before that.

Add tests in `email-store.test.mjs` (existing `resolveMessageRef` test around line 110):
- `emsg-` + matching account → ok
- `emsg-` + wrong account → null
- `emsg-` + `accountId` null → ok (returns row’s account)

**Verify**: `node --test electron/__tests__/email-store.test.mjs` → pass.

### Step 2: `applyEmailFocus` + list/read with `accountId`

Extend the focus intent to `{ sourceId, folder?, uid?, accountId? }`.

Thread `accountId` through the `dome:focus-email` listener (the CustomEvent detail already may include it — type it).

`loadFolder` / `refreshInbox` / `openMessage` must pass `accountId` when set (`window.electron.email.listEnvelopes` / `read` already accept it — see `app/types/global.d.ts`).

If `accountId` is set, use it for that load even when it is not the project default.

Add `activeAccountId` state in `EmailView`:
- Initial: `null` meaning “use server default” (current behavior).
- On successful focus with `accountId`, set `activeAccountId`.
- Pass `activeAccountId ?? undefined` into list/read/sync.

A visible account `<Select>` is **required only if** `listAccounts` returns more than one account for the project. Reuse shadcn `Select` from `app/components/ui/`. Show account email/label, never raw ids (no-raw-ids rule). i18n: `email.account_label` in en/es/fr/pt if you add UI chrome.

**Verify**: `pnpm run typecheck` → 0.

### Step 3: Do not redesign the hub

Do not add a second sidebar of accounts. One control in the existing HubHeader actions (next to folder / sync) is enough.

**Verify**: `git diff --stat` — no new `Email*V2` files; no Dialog-only account picker.

## Test plan

- Store: three `resolveMessageRef` cases in Step 1.
- No Electron UI test required. If you add `toEmailPin` usage in focus, reuse 039 tests.

## Done criteria

- [ ] `emsg-` read without `accountId` succeeds when the row exists
- [ ] `emsg-` read with a **different** explicit `accountId` still fails
- [ ] `applyEmailFocus` passes `accountId` to `listEnvelopes` / `read`
- [ ] Multi-account projects can switch `activeAccountId` (select or at least via focus)
- [ ] Typecheck + email-store tests pass
- [ ] No files outside Scope
- [ ] `plans/README.md` row 042 → DONE

## STOP conditions

- `email.listAccounts` IPC shape is not `{ success, accounts: { id, email / name }[] }` and you would need a new IPC — STOP.
- Adding `activeAccountId` forces a rewrite of MailDashboard queues beyond passing the id — STOP and do the minimum: focus + resolve only, skip the Select.

## Maintenance notes

- Default account remains the Settings `is_default` row when `activeAccountId` is null.
- Reviewer: never show account UUIDs in the Select trigger.
- Agent tools still use default account unless 041/future adds `account_id` on tools — out of scope here.
