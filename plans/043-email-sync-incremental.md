# Plan 043: Sync incremental real + search que escribe cache

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 94211348..HEAD -- electron/email/email-sync-service.cjs electron/email/email-store.cjs electron/email/himalaya-service.cjs`
> If excerpts no longer match, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (004 DONE). Lands **before** 041 if you want Sent search to see more than 500 envelopes.
- **Category**: perf
- **Planned at**: commit `94211348`, 2026-09-04

## Why this matters

`syncAccount` uses `maxPages = 5` and `pageSize = 100` → at most 500 envelopes per folder. `setSyncState` is called with `status` / `lastSyncedAt` only — `last_uid` is never written, so there is no incremental cursor. `searchEnvelopes` hits IMAP every time and does not `upsertEnvelope` (unlike `listEnvelopes`). Large INBOX/Sent stay incomplete; Many cannot find mail older than the first five pages; every agent search is a live round-trip.

## Current state

`electron/email/email-sync-service.cjs`:
- `pickTargetFolders` — INBOX + names containing SENT (lines 36–44).
- `syncEnvelopePage` — `source: 'live'`, upserts, `done` when `envelopes.length < pageSize` (78–100).
- `syncFolder` — `for (page = 1; page <= opts.maxPages; page++)` (113–117).
- After the loop, `setSyncState({ status: 'idle', lastSyncedAt })` — **no** `lastUid` (119–123).
- `syncAccount` default `{ maxPages = 5, pageSize = 100 }` (138).

`electron/email/email-store.cjs` `setSyncState` (403–447) already accepts `patch.lastUid` / `cursor`. Column `email_sync_state.last_uid` exists (plan 004).

`electron/email/himalaya-service.cjs` `listEnvelopes` persist block (458–462) vs `searchEnvelopes` (469–478) — search maps `normalizeEnvelope` and returns, no upsert.

**Convention**: bodies stay lazy (004). Do not fetch HTML for every envelope during sync. No PII in logs (`err.message` only, already the pattern).

**Exemplar**: persist loop in `listEnvelopes` — copy that into search.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Store tests | `node --test electron/__tests__/email-store.test.mjs` | exit 0 |
| Typecheck | `pnpm run typecheck` | exit 0 |

There is no sync-service test file today. Add `electron/__tests__/email-sync-service.test.mjs` **only if** you can inject a fake `listEnvelopes`. If mocking Himalaya is more than ~40 lines, put cursor/`lastUid` tests in `email-store.test.mjs` and a small extracted `maxUidFromEnvelopes` helper tested there.

## Scope

**In scope**:
- `electron/email/email-sync-service.cjs`
- `electron/email/email-store.cjs` (helper to record max uid if needed; no schema change)
- `electron/email/himalaya-service.cjs` (`searchEnvelopes` persist only)
- `electron/__tests__/email-store.test.mjs` and/or `electron/__tests__/email-sync-service.test.mjs`

**Out of scope**:
- Body backfill / full history download
- Changing Himalaya binary flags beyond existing `envelope list --page`
- Frontend sync badge copy
- Raising renderer `LIST_PAGE_SIZE` in EmailView
- blob-sync

## Git workflow

- Branch: `feat/043-email-sync-incremental`
- Commit: `fix: persist email last_uid and cache search hits`
- Do NOT push unless asked.

## Steps

### Step 1: Write `last_uid` after each successful folder sync

In `syncFolder`, after the page loop (success path):
- Compute `maxUid` from upserted envelopes this run **or** from `listCachedEnvelopes` for that folder (numeric max of `id`/`uid`).
- `setSyncState(accountId, folderRow.id, { status: 'idle', lastSyncedAt: Date.now(), lastUid: maxUid || existing })`.

Add `maxImapUid(envelopes)` in `email-store.cjs` (export it): walk `id` or `uid`, keep values matching `/^\d+$/`, return the max as string or null.

**Verify**: unit test `maxImapUid([{ id: '2' }, { id: '10' }]) === '10'`; empty → null. `node --test electron/__tests__/email-store.test.mjs`.

### Step 2: Stop the blind 5-page cap

Change `syncAccount` default to `maxPages = 50` (hard safety) and `pageSize = 100`. Document in a one-line comment: safety cap, not a product limit.

In `syncFolder`, keep `done` when a page returns fewer than `pageSize`. If you hit `maxPages` without `done`, set `status: 'idle'` still, but set `error` to `null` and persist `lastUid`; do **not** throw. Optionally log `[email-sync] folder truncated at maxPages`.

Do **not** implement UID-range IMAP search in this plan unless `listEnvelopes` already supports a `sinceUid` option (it does not today). Incremental “only new uids” via Himalaya is a follow-up. This step is: (a) remember last_uid, (b) allow more pages so Sent is not stuck at 500.

**Verify**: read `syncAccount` defaults — `maxPages >= 20`. `rg -n "maxPages = 5" electron/email/email-sync-service.cjs` → no match.

### Step 3: Search upserts like list

In `searchEnvelopes`, after `normalizeEnvelope`, copy the `listEnvelopes` persist try/catch (`upsertFolder` + `upsertEnvelope` per env). Pass `{ accountId: id, folder }` into `normalizeEnvelope` if 039 added that ctx argument; if 039 is not merged, persist with current `normalizeEnvelope(e)` (uid-only envelopes still upsert).

**Verify**: `rg -n "upsertEnvelope" electron/email/himalaya-service.cjs` → hits in both `listEnvelopes` and `searchEnvelopes`.

## Test plan

- `maxImapUid` cases (numeric, ignore non-numeric, empty).
- `setSyncState` already exists — add one test that `last_uid` persists when `patch.lastUid` is set (if not already covered).
- Do not hit a real IMAP server.

## Done criteria

- [ ] Successful `syncFolder` writes `last_uid` when a numeric uid exists
- [ ] Default `maxPages` is no longer 5
- [ ] `searchEnvelopes` upserts envelopes into SQLite
- [ ] Bodies are still not fetched during sync
- [ ] Store tests + typecheck pass
- [ ] No files outside Scope
- [ ] `plans/README.md` row 043 → DONE

## STOP conditions

- Himalaya `envelope list --page` is 1-based and you discover pages are newest-first, so raising `maxPages` still never reaches old Sent — STOP and report (do not invent a custom UID fetch without evidence).
- `email_sync_state` table in the user’s mental model lacks `last_uid` in a fresh DB — verify `electron/core/database.cjs` / migrations; if the column is missing, STOP (do not hand-roll a migration unless you are sure 004 already added it — it did).

## Maintenance notes

- 041 Sent search quality depends on this cache.
- A later plan can use `last_uid` as `UID ${last}:*` if Himalaya grows that filter.
- Reviewer: no `console.log` of subjects; keep `[email-sync]` messages to counts and folder names.
