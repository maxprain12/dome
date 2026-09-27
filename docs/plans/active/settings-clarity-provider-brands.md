---
status: active
created: 2026-09-27
---
# Clear settings and complete onboarding review

## Intent
Make every settings destination understandable without knowing the underlying system. Keep onboarding optional, preserve existing account/local work, and show correct provider identities offline.

## Audit and decisions
- Replace the height-dependent collapsing navigation with stable, scannable groups organized around user tasks. Preserve section IDs and deep links.
- Give all 19 destinations consistent headings, plain-language descriptions and a concrete first step. Increase form legibility and responsive spacing without changing unrelated hubs.
- AI: explain each subtab; separate connection essentials from optional model curation; use the right provider logos instead of monograms and other brands. Download vetted SVG assets with pinned provenance and license.
- Fix misleading save feedback: profile persistence must finish before success; connection testing must stop after a failed save; saving transcription must not change the chat provider; asynchronous provider loads must not overwrite another selection.
- Review welcome → local/account → section guidance → settings and return navigation, language, keyboard access, error states and restored sessions.

## Validation
Focused regression tests for state transitions and deep links, repository-required checks, and isolated Electron walkthroughs in light/dark and compact layouts. No production accounts or billable AI calls are created for verification.

## Review results
The full isolated Electron journey passed: invalid registration, switch to login, local entry, guide dismissal, all 19 settings sections, all five AI tabs, provider selection, account form from settings, return to the app and restart without repeating onboarding. All 24 rendered brand images loaded; 1024×720 had no horizontal overflow; no renderer exceptions.

Visual review removed a redundant numbered setup row and moved access-level comparisons and model curation behind optional disclosures. The compact provider selection scrolls to its configuration. Navigation labels wrap instead of disappearing behind truncation.

Authentication confirmation and persistence retries remain covered by the existing AccountForm tests. No production signup, external message, provider billing call or purchase was performed.

## Local checks
- Full renderer suite: 128 files, 532 tests passed. Final focused settings/account suite: 28 tests passed (including missing-key validation added after the full run).
- Typecheck, lint (0 errors, 117 pre-existing warnings), build, guardrails, Sonar diff, IPC inventory, remote protocol and dependency rules passed.
- Provider assets come from a pinned Lobe Icons revision; SVGs contain no scripts or external image references. Existing provider marks are retained where appropriate; every supported provider now has a local asset.
