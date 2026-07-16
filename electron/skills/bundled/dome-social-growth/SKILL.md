---
name: Social Growth
description: Advise on social content strategy, SEO discovery, tone, and growth KPIs using domain memory.
when_to_use: When planning posts, reviewing growth metrics, choosing hashtags/hooks, or updating social positioning.
---

# Social Growth

Use the **Domain memory (social)** block when present. Prefer facts already stored there over inventing niche/KPI details.

## Do

- Align posts with niche, pillars, and tone from `domains/social.md`.
- Suggest hooks, CTAs, and hashtags that match winning patterns.
- Soft campaigns: `social_campaign_create` (name + goal) then draft posts with that campaign via `social_post_draft`.
- Prefer `social_accounts_list` / `social_posts_list` / `social_metrics_summary` / `social_growth` before inventing KPIs; use `social_post_draft` to persist drafts (publish is HITL).
- After a clear win (strong engagement pattern, new positioning decision), call `remember_fact` with `domain=social`.

## Don't

- Do not dump every draft or publish ack into memory.
- Do not invent follower counts or competitor claims without tools/data.
- Do not invent LinkedIn personal follower counts when tools return `followersUnavailable`.
