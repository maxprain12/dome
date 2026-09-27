# Account access and workspace modes

## Three independent concepts

| Concept | Source of truth | Effect |
| --- | --- | --- |
| Access tier | Authenticated session + verified subscription | Local, Account or Subscription |
| Commercial plan | Dome Provider quota response | Plan name, subscription status and granted capabilities |
| Workspace mode | Local edition preference | Pro, Study or Dev navigation and tool selection |

Local work does not require registration. Creating an account is not a subscription and does not enable cloud synchronization. Choosing the Pro workspace mode is not purchasing Dome Pro. Existing commercial plan IDs, billing, prices and usage quotas remain owned by Dome Provider; this change does not invent or change those contracts.

## Capability matrix

| Capability | Local | Account | Subscription |
| --- | --- | --- | --- |
| Notes, files, projects and local tools | Available | Available | Available |
| Own AI provider | Configure provider | Configure provider | Configure provider |
| Account identity and account photo | Connect account | Available | Available |
| Cloud sync | Account required | Subscription required | `cloud_sync` |
| Cloud social publishing | Account required | Subscription required | `social_cloud` |
| Cloud pipelines | Account required | Subscription required | `pipelines_cloud` |

Own AI providers and third-party services retain their own authentication and usage requirements. Dome AI requests remain checked by the provider, including quota. Cloud capabilities are granted only for active or trialing subscriptions. An explicit empty feature list denies access, including for `dome_pro`. Compatibility with older quota responses is limited to the existing `dome_pro` → `cloud_sync` fallback when the feature list is absent.

## Enforcement and recovery

`electron/storage/plan-gate.cjs` resolves the current session before reading its five-minute cache. Cached responses are scoped to the account, invalidation rejects in-flight stale responses, and network failures are not cached. Main-process cloud sync and publishing operations continue to assert capabilities; hiding or disabling a UI control is not the enforcement boundary.

The renderer fails closed while loading or when verification fails. It distinguishes an unavailable entitlement service from no account, an inactive subscription, and a feature excluded by the current plan. Returning from the browser refreshes permissions; the retry control bypasses cache. Session events immediately revalidate after native login and disconnect.

Settings always exposes the account and Sync destinations. Locked cloud controls are replaced by an explanation and a working route to account connection or the existing billing dashboard. Local content remains available after logout or subscription expiry.
