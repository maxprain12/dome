# Plan 039: Canonizar pins de email (`emsg-…` + meta)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 94211348..HEAD -- app/lib/chat/pinLabels.ts app/lib/store/useManyStore.ts app/lib/many/useManySend.ts app/components/email/EmailView.tsx electron/email/email-store.cjs electron/search/source-index.cjs app/lib/many/hydratePinnedContext.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> Working-tree note: `hydratePinnedContext.ts` may already contain
> `buildPinnedEmailReadArgs` (uncommitted at plan time). Keep that helper;
> do not revert it.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (004 / 007 / 023 already DONE)
- **Category**: bug
- **Planned at**: commit `94211348`, 2026-09-04

## Why this matters

`@` mention / ⌘K pin an email as SQLite `emsg-…`. «Preguntar a Many» pins the IMAP uid (`env.id`). `addPinnedResource` dedups only by `id`, so the same mail can appear twice. `pinSnapshot` drops `meta`, so `dome.pins` in the JSONL has no `uid` / `folder` / `accountId`. Live Himalaya envelopes also omit `dbId` / `accountId`, so `applyEmailFocus` cannot match `emsg-…` after a live list.

After this plan, every UI path produces the same pin: `id = emsg-…` when known, plus `meta.{uid,folder,accountId,dbId}`. Live envelopes carry `dbId` + `accountId`. IMAP uids stored in SQLite are numeric only.

## Current state

- `app/lib/chat/pinLabels.ts` — `normalizePinnedResource` for email keeps whatever `id` the caller passed (lines 137–143). Existing tests: `app/lib/chat/pinLabels.test.ts`.
- `app/components/email/EmailView.tsx` — Ask Many pins IMAP uid as `id` (lines 609–625).
- `electron/search/source-index.cjs` — `@` / search hits use `id: row.source_id` (`emsg-…`) and `meta.uid` as a SQLite number (lines 633–644).
- `app/lib/store/useManyStore.ts` — `PinnedResource.meta` exists (lines 27–39) but `ManyMessage.pinnedResources` is `Pick<…, 'id' | 'title' | 'type' | 'kind'>` (line 65). Dedup: `r.id === resource.id` (line 687).
- `app/lib/many/useManySend.ts` — snapshot strips meta (lines 254–258).
- `electron/email/email-store.cjs`:
  - `messageRowId` already exported (lines 19–26, 479).
  - `envelopeToFields` uid fallback includes RFC `message_id` (line 111).
  - `mapMessageRow` has `dbId` + `accountId` (lines 232–246).
  - `normalizeEnvelope` does **not** (lines 281–292).
- `app/lib/many/hydratePinnedContext.ts` — `buildPinnedEmailReadArgs` already coerces numeric `uid` and forwards `accountId` / `folder`. Keep it.

**Convention**: pin titles stay human (`.cursor/rules/no-raw-ids-in-ui.mdc`). Opaque ids only in `value` / `id` / `meta`. Labels via `formatEmailPinLabel`.

**Exemplar**: `normalizePinnedResource` + tests in `pinLabels.test.ts` — add `toEmailPin` next to it.

Ask Many today (do not keep this `id`):

```ts
many.addPinnedResource({
  id: String(env.id), // IMAP uid — WRONG after this plan
  title: env.subject || t('email.no_subject'),
  type: 'email',
  kind: 'email',
  meta: { folder, uid: String(env.id), dbId: env.dbId || undefined, accountId: env.accountId },
});
```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Renderer tests | `pnpm exec vitest run --config vitest.renderer.config.ts app/lib/chat/pinLabels.test.ts app/lib/many/hydratePinnedContext.test.ts` | exit 0 |
| Store tests | `node --test electron/__tests__/email-store.test.mjs` | exit 0 |
| Typecheck | `pnpm run typecheck` | exit 0, no errors |
| Sonar | `pnpm run check:sonar-patterns` | exit 0 |

## Scope

**In scope**:
- `app/lib/chat/pinLabels.ts`
- `app/lib/chat/pinLabels.test.ts`
- `app/lib/store/useManyStore.ts`
- `app/lib/many/useManySend.ts`
- `app/components/email/EmailView.tsx` (`askManyAbout` only)
- `electron/email/email-store.cjs`
- `electron/__tests__/email-store.test.mjs`
- `electron/email/himalaya-service.cjs` (only the `normalizeEnvelope` call sites that must pass `{ accountId, folder }`)
- `app/lib/many/hydratePinnedContext.ts` (only if `toEmailPin` must be used when re-wrapping; prefer not)

**Out of scope**:
- Sticky pins / re-hydrate last turn (040)
- `applyEmailFocus` `accountId` / account picker (042)
- Sync pagination / `last_uid` (043)
- Thread search prompts (041)
- Himalaya protocol, schema migrations, blob-sync
- `CommandPalette` pin-to-Many (it focuses the tab; not a Many pin)

## Git workflow

- Branch: `feat/039-canonical-email-pin`
- Commit style: `fix: …` (example from log: `fix(sonar): S3776 vault-sync.cjs …`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: `toEmailPin` + email dedup

Add and export from `pinLabels.ts`:

```ts
export function toEmailPin(input: {
  title: string;
  uid?: string | number | null;
  dbId?: string | null;
  folder?: string | null;
  accountId?: string | null;
}): PinnedResource
```

Rules:
- `uid` → `String(uid)` when non-empty after trim.
- `id` = `dbId` if it starts with `emsg-`; else if only uid is known, `id = uid` (Ask Many before cache has `dbId`). Prefer `emsg-` whenever `dbId` exists.
- `kind: 'email'`, `type: 'email'`, `title: formatEmailPinLabel(input.title)`.
- `meta: { uid, folder, accountId, dbId }` — omit keys that are empty.

Add `emailPinsMatch(a, b)` (same file): both `kind === 'email'` and any of: same `id`; same `meta.dbId`; same `meta.uid` + `meta.accountId` + `meta.folder` (folder default `INBOX` if missing).

In `useManyStore.addPinnedResource`, if the incoming resource is email, skip push when `emailPinsMatch` against an existing pin (still keep the `id ===` check for other kinds).

Call `toEmailPin` from `EmailView.askManyAbout` using `env.dbId`, `env.id` (uid), `folder`, `env.accountId`.

**Verify**: `pnpm exec vitest run --config vitest.renderer.config.ts app/lib/chat/pinLabels.test.ts` → pass, including new cases below.

### Step 2: Persist `meta` on the user turn

Widen `ManyMessage.pinnedResources` to `Pick<PinnedResource, 'id' | 'title' | 'type' | 'kind' | 'meta'>`.

In `useManySend` `pinSnapshot`, copy `meta: r.meta ?? null` as well.

**Verify**: `pnpm run typecheck` → exit 0.

### Step 3: Live envelopes expose `dbId` + `accountId`; uid IMAP numeric only

In `envelopeToFields`:
- Take uid only from `env.id` or `env.uid`.
- Accept only `/^\d+$/`. Otherwise `uid = ''` (then `normalizeEnvelope` already returns null when `!fields.uid`).
- Do **not** fall back to `message_id` / `message-id`.

Change `normalizeEnvelope(env, ctx)` so `ctx` is optional `{ accountId?: string, folder?: string }`. When `accountId` + `folder` + numeric uid are present:
- `upsertFolder(accountId, folder)` or `getFolderByRemote` then `messageRowId(accountId, folderRow.id, uid)`.
- Return `dbId` and `accountId` on the envelope (same keys as `mapMessageRow`).

Update `listEnvelopes` (and any other `normalizeEnvelope(e)` in `himalaya-service.cjs`) to pass `{ accountId: id, folder }`.

**Verify**: `node --test electron/__tests__/email-store.test.mjs` → pass. Add cases:
- `envelopeToFields` / `normalizeEnvelope` rejects `{ id: '<rfc-message-id@x>' }` (returns null).
- `normalizeEnvelope(env, { accountId, folder })` sets `dbId` starting with `emsg-` and `accountId`.

## Test plan

Model renderer tests after `app/lib/chat/pinLabels.test.ts`. Model store tests after `electron/__tests__/email-store.test.mjs`.

New cases:
- `toEmailPin` with `dbId` + numeric `uid` → `id === dbId`, `meta.uid` string.
- `toEmailPin` with only uid → `id` is the uid string (fallback).
- `emailPinsMatch` true for `{ id: '1842', meta.uid: '1842' }` vs `{ id: 'emsg-abc', meta.uid: '1842', meta.dbId: 'emsg-abc' }` same folder/account.
- `emailPinsMatch` false for different accounts.
- Store: RFC Message-ID is not stored as uid.
- Store: live normalize with ctx yields `dbId`.

Keep existing `hydratePinnedContext` tests (numeric uid + `accountId`).

**Verify**: both test commands in the table → all pass.

## Done criteria

- [ ] `pnpm run typecheck` exits 0
- [ ] Renderer + email-store tests above exit 0 with the new cases
- [ ] `askManyAbout` uses `toEmailPin` (no raw `id: String(env.id)` as the only identity when `env.dbId` exists)
- [ ] `pinSnapshot` includes `meta`
- [ ] `normalizeEnvelope` can return `dbId` + `accountId`
- [ ] `envelopeToFields` does not use RFC `message_id` as IMAP uid
- [ ] No files outside Scope are modified (`git status`)
- [ ] `plans/README.md` row 039 → DONE (executor updates this)

## STOP conditions

- `normalizeEnvelope` cannot compute `dbId` without a folder id and you would need a schema migration — stop and report.
- `MailEnvelope` type in the renderer has no `dbId` / `accountId` fields and fixing it requires a large type rewrite beyond adding optional fields — stop and report.
- Himalaya live envelopes use a non-numeric uid scheme on a real account you cannot ignore — stop and report (do not invent a second id format).

## Maintenance notes

- 040 reads `meta` from the last user message — this plan must land first.
- 042 `applyEmailFocus` matches `env.dbId`; live lists must keep exposing it.
- Reviewer: no raw `emsg-` / uid in visible chip titles; ids stay in `id` / `meta`.
