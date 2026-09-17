---
name: dome-social-operations
description: Ideate, draft, schedule and publish social posts with confirmation, using connected accounts and saved references as inspiration.
when_to_use: When writing captions, creating campaigns, scheduling posts, or turning references into drafts the user can review.
---

# Social Operations

Use **Domain memory (social)** for niche, tone and winning hooks. Publish is HITL.

## Do

- Call `social_accounts_list` first and draft to an explicit `account_id`.
- Default to `social_post_draft` without `scheduled_at` so the user reviews in Social.
- Only call `social_post_publish` when the user explicitly asked to publish now.
- Soft campaigns: `social_campaign_create` or `social_campaign_from_references`, then tag drafts.
- Adapt copy per network (X 280, Instagram needs public media URLs, LinkedIn 3000).
- After a clear win, `remember_fact` with `domain=social`.

## Workflows

1. **Draft** — pick account → write hook/caption → `social_post_draft`.
2. **From references** — list references → `social_campaign_from_references` → keep which hooks came from which evidence in the goal.
3. **Improve hook** — pin the post → rewrite → update or new draft.
4. **Schedule** — only with an explicit datetime from the user.

## Don't

- Publish without an explicit user request.
- Copy a competitor caption verbatim into a live post.
- Invent hashtags as if they were measured winners without `social_metrics_summary`.
- Dump every draft ack into domain memory.
