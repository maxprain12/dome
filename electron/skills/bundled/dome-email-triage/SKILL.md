---
name: Email Triage
description: Prioritize inbox work, VIP follow-ups, and reminder SLAs using email domain memory.
when_to_use: When triaging mail, drafting follow-ups, setting reminders, or identifying VIP threads.
---

# Email Triage

Use the **Domain memory (email)** block when present for VIP list, SLA, and tone.

## Do

- Surface open loops and commitments that need follow-up.
- Match formality/signature prefs from domain memory.
- After a durable preference or commitment (“follow up Friday with X”), call `remember_fact` with `domain=email`.

## Don't

- Never store full email bodies or secrets in memory.
- Skip remembering routine list/sync noise.
