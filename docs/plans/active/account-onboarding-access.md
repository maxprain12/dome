---
status: active
created: 2026-09-26
---
# Account-first onboarding and capability access

## Decisions
- Replace the seven-step wizard with a standalone welcome screen: register, sign in, or start locally. Language stays available immediately.
- Do not ask for permissions, AI credentials, edition, biography or skills before the first useful action. Do not overwrite restored identity files.
- Separate access tiers (local, account, subscription) from workspace editions (Pro, Study, Dev). Commercial plan IDs and capabilities remain server-authoritative; no invented prices or quotas.
- Keep local work available. Explain account/subscription requirements at cloud entry points; enforce capabilities in main as well as the UI. Unknown entitlements fail closed with a retry, never masquerade as a downgrade.
- Following the supplied reference: a dedicated setup screen inside each section, with an illustrated primary task, secondary cards, explicit read progress and a real cloud access card. Keep underlying work mounted; share coverage in the tab router.

## Delivery
1. Delete legacy wizard and unused configuration orchestration. Build accessible account form and first-run welcome.
2. Normalize entitlement states and account-aware cache; add account/plan settings and contextual access feedback.
3. Extend section guides to all primary surfaces and mount centrally.
4. Exercise account failures/confirmation/retry, capability matrix and section guide persistence; verify UI and run repository checks.
5. Open PR, enable squash auto-merge and inspect CI.

## Audit
The old flow asks seven unrelated questions, requires identity writes and bundled skill installs, closes a returning-user overlay even after a persistence failure, and cannot submit login with Enter. Cloud settings disappear for non-subscribers, account presence is confused with cloud access, and cached permissions are not scoped to account identity. Existing guides cover six sections and are help-only rather than first-visit guidance.

## Visual reference refinement
The user clarified that section onboarding should look like the supplied setup dashboard, not explanatory banners. The banners were replaced by section setup screens. Their progress means explanations reviewed, not inferred task completion. Every screen has an immediate way into the section and can be reopened.

Illustration: `public/onboarding/workspace-notebook.png`, generated with the built-in image tool. Prompt: “Single compact isometric spiral notebook with three layered sage/lime translucent covers, deep forest green edges and three dark green loops; frosted glass/resin, upper-left studio light, subtle shadow, true transparent background, no text, logos or extra objects.”

## Verification — 2026-09-27
- Full renderer suite: 125 files, 519 tests passing; after the final settings navigation adjustment, all 7 section setup tests pass.
- Main-process entitlement and post-login tests: 14 passing.
- Typecheck, lint (0 errors, 117 existing warnings), production build, guardrails, Sonar diff, IPC inventory, remote protocol and dependency rules pass.
- Isolated Electron profiles: first-run registration validation, login switch, local entry, dismiss/reopen, explicit read progress, navigation, account and locked sync. No renderer exceptions. Light, dark and 1024×720 layouts inspected; no horizontal overflow.
- Settings guidance is on demand so account/AI/integration links lead directly to their destination. Guides preserve the mounted editor and its unsaved draft.
- Native authentication behavior is covered with mocked responses; no production account or paid subscription was created for verification.

## Simplification review
Deleted the old wizard, its flow/configuration orchestration, obsolete translation keys, automatic identity/skill configuration and duplicate section-help triggers. One shared account form, one guide layout and one server-backed capability model now own these responsibilities. The server still owns commercial prices and quotas.
