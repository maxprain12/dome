---
name: dome-social-insights
description: Explore public and connected social profiles, compare competitors, and ground recommendations in saved evidence.
when_to_use: When analysing a profile or post, building a watchlist, comparing competitors, or investigating trends with cited sources.
---

# Social Insights

Use **Domain memory (social)** when present. Prefer tools over memory for current metrics.

## Do

- Resolve URLs with `social_public_resolve` before describing a public profile or post.
- If limitations include `requires_browser`, ask the user to open the page and use `browser_extract_social`.
- Save third-party evidence with `social_reference_save`. Never put competitor posts in `social_posts`.
- Build watchlists with `social_watchlists_list` / `social_watchlist_add` (competitor, inspiration, following). Do not promise a full following import.
- Compare with `social_competitive_report` and cite titles, handles and URLs from the result.
- Use `social_trends_snapshot` for the hybrid radar: Your radar (own posts + references) plus For you / Emerging / Popular only when claims include temporal multi-author evidence. Never invent missing metrics or platform Explore feeds. Draft from angles, not copied titles.
- Call `social_accounts_list` / `social_metrics_summary` / `social_growth` before claiming performance. If `followersUnavailable` or metrics are missing, say so.

## Workflows

1. **Watchlist** — resolve URL → save reference or add watchlist member → confirm the human-readable name.
2. **Profile** — public resolve or connected account → card first, then narrative.
3. **Post breakdown** — resolve or `social_post_get` → describe format, hook, CTA, limitations.
4. **Competitive compare** — watchlist + references + own published posts. Omit missing metrics.
5. **Trends** — 7/30/90 snapshot; cite evidence; distinguish Your radar from global/native trends; recommend video/carousel only from saved metrics.

## Don't

- Invent metrics, follower counts, or viral topics.
- Treat Open Graph titles as official analytics.
- Overwrite user skill customizations or install skills implicitly.
- Remember every list result; only durable positioning via `remember_fact` `domain=social`.
