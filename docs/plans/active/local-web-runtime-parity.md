---
status: active
owner: dome
upstream: earendil-works/pi@b271b0a524b29e13c0c9e748aea0d34e1597f2db
---

# Local browser and AI runtime parity

Implement the approved plan in three independently reviewable changes:
1. Native Electron browser, bounded/cancellable local web search, sources and in-app recovery without an extension.
2. Browser actions, local profiles, advanced execution options, files, recordings and optional local Chromium/CDP.
3. Unified provider collections, image generation, classifiers, credential/catalog persistence and settings integration.

Search is always local (DuckDuckGo → Bing; Google explicit), five results by default and ten maximum, 45-second total budget, five-minute in-memory cache and shared identical requests. Chromium is shipped with Electron; web pages receive no Dome preload or Node access. Browser sessions are isolated by execution and two active sessions are allowed per app instance. User-facing browser surfaces use shell tabs, never additional Electron windows. The extension remains optional and explicitly selected.

Preserve historical migrations and disabled automations. Keep AI credentials in main. Exclude hosted browser services and remote infrastructure. Run deterministic parser/concurrency/security tests, native Electron smoke, provider parity tests and all repository gates before publishing phase PRs and enabling squash auto-merge.

## Acceptance matrix

| Capability | Baseline | Target verification |
| --- | --- | --- |
| Local search without extension/key | Removed | engines, captcha, empty, timeout, cache, cancellation |
| Native read/capture/navigation | Extension only | native Electron fixtures and public URL guard |
| Tabs and actions | Partial | stale IDs, background keyboard, upload and download |
| Profiles/emulation/recording | Absent | isolated state, bounded output, packaged runtime |
| Provider collections | SDK only | shared credentials, dynamic catalog, legacy consumers |
| Images | SDK only | agent-generated persisted resource |
| Classifiers/mixed catalogs | Absent | typed probabilities and provider error/usage contracts |
| Handoffs and structured output | Partial | preserved session, model capability validation |

Each phase updates this matrix with the actual test commands and limitations; do not label an unverified capability complete.

## Phase 1 evidence

Implemented local engine extraction, coalescing/cache, cancellable two-slot pool, shared extension page capture, native browser recovery tab, search catalog/dispatcher integration and Chromium URL-reader fallback.

Passed: 17 targeted Node tests (search, browser-tool multimodal contract and historical retirement), typecheck, lint (existing warnings), renderer tests, guardrails, Sonar diff, IPC inventory/Zod, remote protocol, production Vite build and dependency-cruiser. Native Electron smoke passed against an isolated fixture: DOM, screenshots, no Node/app preload and cleanup. Installer validation on Windows/Linux remains pending; those platforms cannot be exercised on this macOS host.

## Phase 2 evidence

The session-bound native browser registry now exposes navigation, snapshots, captures, element actions, scoped tabs, background CDP input/upload, JavaScript, structured extraction, scoped text files, encrypted state references and schema-validated completion on the existing agent loop. Run options cover initial actions, tool filters, domain policy, extraction model, vision, complete-turn history budgets, provider retries, step/request timeouts and a final response after the failure budget. Settings expose isolated/named profiles, allowed domains, retained sessions and workspace downloads.

Electron remains sandboxed. Optional `playwright-core` connects only to an explicitly selected installed Chromium or loopback CDP; custom executable/channel/environment/arguments belong to that backend. Named advanced profiles are encrypted locally. Captures can include bounded frame snapshots and element highlights. Downloads are confined to a run workspace. Optional GIF/MP4 capture and scrubbed HAR/network traces use packaged FFmpeg and workspace output, with size/time/event limits. Password references are resolved in main; subsequent evaluation/capture is restricted and observed text is redacted.

Passed: native action policy/file/CDP/history/completion tests; 546 renderer tests; TypeScript, lint, build, guardrails, Sonar, IPC/Zod/protocol inventory, tool-cap and packaged dependencies. Native Electron fixture verifies stale snapshot rejection, CDP input without window focus, file upload, multiple tabs, screenshots and cleanup. On this macOS host the smoke command uses `--disable-gpu` to avoid a platform startup crash; production sandbox settings are unchanged.

Cross-platform installers and live external Chromium/profile/OAuth combinations remain acceptance checks requiring their respective installations/accounts. Trace output is a scrubbed network-event trace, rather than the Python Browser-Use trace format.

## Phase 3 evidence

Synchronized the vendored pi-ai implementation and lazy adapters to the fixed upstream commit, retaining Dome bridges and the legacy image collection API. Included generated mixed catalogs (chat, image, classifier), classification protocols, compact assistant frames, transcript/system-message support and deferred/provider contracts. Provider catalog data was generated using the pinned upstream generator on 2026-10-02; upstream excludes these generated files from Git. See `packages/ai/UPSTREAM.md` for adaptations and attribution.

A profile collection shares Dome encrypted credentials and persisted dynamic catalogs across chat, the harness, generation and classification. Settings expose model selections, provider-scoped API/OAuth login, catalog refresh diagnostics and custom compatible providers. Agent tools persist generated images as library resources and return adapter classifier answers/usage. Model handoff checks reject image history on text-only models and preserve the session; existing reasoning clamping and context compaction remain active. The native completion tool ends the existing loop with schema validation.

Passed: 160 SDK tests, 82 harness tests, ten image/classifier/auth/cancellation/handoff/catalog/credential/local-provider/JSON-mode contracts, native action and runtime characterization tests, 548 renderer tests, TypeScript, lint (existing warnings), build, guardrails, Sonar, IPC inventory/Zod, remote protocol, tool coverage/priorities, packaged dependency resolution and dependency-cruiser. Both Electron and installed Chrome passed the isolated browser/CDP/upload/tab/capture/GIF/HAR/trace fixture. Recordings are bounded and network traces omit secrets and request bodies.

Remaining platform acceptance: macOS installer packaging and Windows/Linux installers must run on their corresponding build hosts; real account OAuth/provider smoke needs configured accounts. Public search engines can return captchas or change their DOM and are not deterministic acceptance fixtures. No historical automation/search-selection migration was changed or reactivated.

## Final integration checks

The user-reported main-process startup syntax error was corrected by making native tab creation asynchronous. `pnpm run check:main-syntax` now parses every CommonJS main/script source without executing it and runs in CI, alongside SDK and deterministic browser/AI contracts. CI also runs the native Electron browser fixture on Linux.

Additional regression coverage: workspace artifact symlinks; manual captcha retry retaining its temporary isolated partition; recursive classifier tool schemas; concurrent credential refresh metadata; profile catalog persistence; signed Google organic redirects with private destination rejection. Frame interaction uses its own CDP context, and filling/clicking transfers DOM focus for subsequent keyboard actions. Native Electron and installed Chromium fixtures now verify frame input, background keyboard and upload as well as tabs, captures, GIF/HAR/traces; MP4 also passed on native Electron.

Live local searches on 2026-10-02 returned organic sources from DuckDuckGo, Bing and Google. Google client redirects are awaited, and signed organic destination links are resolved by local HTTP with public URL checks, no page bodies or search API. The three-engine smoke completed with orderly session teardown. These smoke observations do not guarantee future public engine availability.

The built Dome shell and AI capability settings were opened using an isolated `DOME_PROFILE`, following the `dome-reproduce-ui` workflow. No renderer errors were observed; IPC reported 42 providers and a mixed catalog of 1,531 chat, 59 image and 18 classifier models. Counts describe the generated catalog, not credential availability. The user's existing profile was not accessed.

Merged phases: #1734 (browser/search), #1735 (actions/options). The third PR contains unified AI integration and the final browser regressions above.

Mac arm64 unsigned application packaging passed, including native executable checks and full ASAR dependency resolution. The packaged app starts with an isolated profile and its AI catalog IPC returns all mixed model types. SDK attribution is included in materialized workspace packages. Signed installer/notarization and Windows/Linux installer checks remain separate platform acceptance requirements.

Background screenshots and recording frames use CDP renderer captures, avoiding native window capture for unattached sessions. The Electron and installed Chromium fixtures verify PNG viewport dimensions, with native GIF/MP4 recording also passing. CI smoke logs separate navigation, input, files, frame actions, tabs and captures for platform diagnosis.
