# Social event cards

## Goal

Add event-only cards to Social Hub: design and publish through Dome Provider, attach their public URL to social posts, manage event updates and Instagram comment-to-DM rules, and inspect delivery metrics.

## Scope

- Provider-backed event-card CRUD, publishing, exports, updates, automations, and metrics.
- SQLite v70 linkage from social posts to an event card.
- Social Hub sections for posts, event cards, updates, automations, and analytics.
- Wallet availability is reported by Provider; missing issuer credentials must degrade to setup-required states.

Stamp, points, rewards, balances, redemption, CRM, SMS, email, referrals, and custom geofencing are explicitly outside this version.

## Validation

Run typecheck, lint, build, IPC inventory, Sonar checks, and dependency-cruiser. Provider must also pass its tests and build.
