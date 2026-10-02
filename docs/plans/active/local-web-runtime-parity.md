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
