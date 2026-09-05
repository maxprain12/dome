# Plan 041: Tras un pin, leer el mail y buscar el hilo (Sent), no 14 searches

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 94211348..HEAD -- packages/tools/src/domains/email app/lib/ai/tools/email-tools.ts app/lib/ai/shared-capabilities.ts`
> If excerpts no longer match, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/039-canonical-email-pin.md, plans/043-email-sync-incremental.md (Sent cache). 040 is recommended so follow-up turns still list the pin, but 041 prompt rules still help turn 1.
- **Category**: bug
- **Planned at**: commit `94211348`, 2026-09-04

## Why this matters

On 2026-09-04 run `eb8353bf`, the user asked for mail they had sent to the person on the pinned inbound message. The agent ran `email_search` ×14 + `email_list` and never `email_read`. It concluded nothing was sent. The pin already identified the inbound mail (Cristian / Real Racing). The right sequence is: read the pin → take `From` / `Message-ID` / `In-Reply-To` / `References` → search **Sent** (and All Mail if needed) for that address or Message-ID — not fourteen INBOX free-text queries.

This plan updates the **tool contract and prompt**, and makes `email_search` default-folder behavior honest (do not silently search only INBOX when the user asks for sent mail). It does **not** invent a new `email_thread` IPC unless you can do it in-process from cached envelopes without Himalaya protocol changes.

## Current state

`packages/tools/src/domains/email/prompt.txt` flow (lines 29–32):

```
1. Check inbox → email_list or email_search.
2. Open one message → email_read with message_id.
```

No mention of pinned sources, Sent, or threading headers.

`packages/tools/src/domains/email/email_search/definition.ts` — `folder` defaults to INBOX (line 16).

`packages/tools/src/domains/email/email_read/definition.ts` — already accepts IMAP uid and `emsg-…` (lines 12–16).

`app/lib/ai/tools/email-tools.ts` 94–114 — renderer `email_search` description: "Search the user's mailbox…"; `folder` optional; IPC `window.electron.email.search({ query, folder })` with no `accountId`.

`app/lib/ai/shared-capabilities.ts` 157:

```
Email / correo / bandeja / inbox: call email_list (INBOX) or email_search, then email_read …
```

Main-process execution uses `@dome/tools` definitions + `electron/tools/ai-tools-handler.cjs`. Renderer tool `execute` is unused on the Many run-engine path; **still keep descriptions in sync**.

**Convention**: tool descriptions live in `packages/tools/src/domains/email/*/definition.ts` and the operational guide `prompt.txt`. Match existing tone. Do not log bodies (004 privacy).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tools tests | `pnpm --filter @dome/tools test` if the package has tests; otherwise skip and rely on repo `pnpm run typecheck` | exit 0 |
| Typecheck | `pnpm run typecheck` | exit 0 |
| Grep stale flow | `rg -n "Check inbox →" packages/tools/src/domains/email/prompt.txt` | no match after the rewrite (the new flow text is present instead) |

## Scope

**In scope**:
- `packages/tools/src/domains/email/prompt.txt`
- `packages/tools/src/domains/email/email_search/definition.ts`
- `packages/tools/src/domains/email/email_read/definition.ts` (description only)
- `app/lib/ai/tools/email-tools.ts` (descriptions only — keep `execute` behavior)
- `app/lib/ai/shared-capabilities.ts` (the email routing hint string only)
- Optional: `electron/tools/tool-definitions.cjs` **only if** it still duplicates email descriptions (search first; update if the string is the old inbox-only hint)

**Out of scope**:
- New Himalaya commands or a new `email:thread` IPC (STOP if you think you need one)
- Changing HITL / `agent_actions`
- Sync pagination (043) — but 041 assumes Sent is syncable; if Sent is empty because of the 500-cap, 043 must land
- Auto-sending replies

## Git workflow

- Branch: `feat/041-email-thread-after-pin`
- Commit: `fix: steer Many to email_read pin then search Sent`
- Do NOT push unless asked.

## Steps

### Step 1: Rewrite the email operational flow

Replace the `## Flow` section in `prompt.txt` with:

1. If **mentioned-sources** lists an `email`, call `email_read` first (`message_id` = pin id or `meta.uid`, `folder` from meta). Do not claim the mailbox is empty before this.
2. To find **mail the user sent** to that person: `email_list_folders` if needed, then `email_search` with `folder` set to the Sent folder (or provider equivalent from `email_list_folders`), query = the other party’s address from the pinned message `From` / `To`. Prefer `Message-ID` / `In-Reply-To` / `References` when the read payload includes them.
3. Only then broaden to INBOX / All Mail. Cap exploratory searches (do not repeat the same query more than twice).
4. Send/reply still HITL.

Add a short **Pinned email** subsection: ids may be `emsg-…` or IMAP uid; both are valid for `email_read`.

**Verify**: `rg -n "mentioned-sources" packages/tools/src/domains/email/prompt.txt` → at least one hit. `rg -n "email_read first|call \`email_read\` first" packages/tools/src/domains/email/prompt.txt` → at least one hit.

### Step 2: Tool descriptions

`email_search` description: say that `folder` defaults to INBOX; when looking for outbound mail you **must** pass the Sent folder from `email_list_folders`; do not spam INBOX searches for “what I sent”.

`email_read` description: when mentioned-sources lists an email, call this before `email_search`.

Mirror the same sentences in `app/lib/ai/tools/email-tools.ts`.

Update the email bullet in `buildSharedResourceHint` (`shared-capabilities.ts` ~157) to: if mentioned-sources has an email, `email_read` first; sent-mail questions use Sent + the address from the pin.

**Verify**: `rg -n "must pass the Sent folder|Sent folder" packages/tools/src/domains/email/email_search/definition.ts app/lib/ai/tools/email-tools.ts` → hits. `pnpm run typecheck` → 0.

### Step 3: Do not add a new tool

If, after Step 1–2, you believe search still cannot target Sent because `email_search` IPC ignores `folder` — open `electron/ipc/integrations/email.cjs` and `himalaya-service.searchEnvelopes`. If `folder` is already forwarded, you are done. If it is dropped, **that** is an in-scope one-line pass-through in the search handler only. Do not add `email_thread`.

**Verify**: `rg -n "folder" electron/ipc/integrations/email.cjs electron/email/himalaya-service.cjs` shows search uses the folder argument.

## Test plan

No new Electron IMAP tests (no live account in CI). If `@dome/tools` has definition snapshot tests, update them.

Optional characterization test: a small markdown/string test is **not** required. Prompt-only changes are verified by the `rg` gates.

## Done criteria

- [ ] `prompt.txt` Flow starts from pinned `email_read`, then Sent search
- [ ] `email_search` / `email_read` descriptions + Many routing hint updated
- [ ] Search IPC still honors `folder` (or you fixed a drop)
- [ ] No new IPC channel
- [ ] `pnpm run typecheck` exits 0
- [ ] No files outside Scope
- [ ] `plans/README.md` row 041 → DONE

## STOP conditions

- Search cannot filter by folder without a Himalaya flag you would have to discover by trial against a live mailbox — STOP and report the current CLI args (`envelope list -f …`).
- You need bodies of every Sent message in the prompt — STOP (privacy + tokens). Read one pin + search envelopes only.

## Maintenance notes

- 043 filling Sent cache makes this actually find old outbound mail.
- Reviewer: no PII in new log lines; do not print subjects in `console.warn`.
- A future `email_thread` tool is deferred on purpose.
