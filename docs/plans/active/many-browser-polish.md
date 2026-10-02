---
title: Many browser and chat polish
status: active
created: 2026-10-03
base: b16fc4cce4e9bba5ce7475c602c837f1b182445d
---

# Plan 001: Make Many browser opening immediate and the chat calm at every width

> Executor: follow each step, verify, and report evidence. Reviewer owns advisor-plans/README.md. Work ONLY in /Users/maxprain/.codex/worktrees/many-browser-polish/dome. Source base b16fc4cce4e9bba5ce7475c602c837f1b182445d (2026-10-02).
> Drift first: git diff --stat b16fc4cc..HEAD -- electron/browser-native app/components/browser app/components/many app/components/chat app/lib/browser app/lib/hooks app/lib/utils app/components/shell app/globals.css eslint.config.mjs package.json packages/i18n
> Any changed code must be reconciled with this plan before editing.

## Status
Priority P1; effort L; risk MED; category bug/performance/UX; dependencies none.

## Why this matters
The user likes the native browser but perceives sluggishness and excessive controls. Links wait for the page to load before showing any browser, resize repeatedly reparents native views, duplicate clicks create extra tabs, and hidden web pages remain unthrottled. Many's fullscreen composer stays dense inside narrow splits. Improve the shared browser and chat while preserving existing sessions, cookies, tool permissions, source navigation and all composer features.

## Current state
Electron 41 + Vite 7 + React 18 strict TS, Base UI shadcn base-mira, Hugeicons, semantic CSS variables. Renderer has no Node APIs. Tabs use useTabStore, never new windows. P-001 keeps SDK/credentials in main. IPC uses Zod handler -> electron/ipc/index.cjs -> preload allowlist -> renderer. Read AGENTS.md, docs/principles.md, .claude/sops/new-ipc-channel.md, .claude/sops/shadcn-ui.md.

- app/lib/browser/openDomeBrowser.ts openDomeBrowser currently awaits invoke('native-browser:open', {url}) then showDomeBrowser(response.data.sessionId).
- electron/browser-native/workspace.cjs open validates first, browser.run desktop:research -> picks blank or creates new tab -> await browser.navigate -> returns state. onOpened callback currently occurs after full navigation in actions/IPC.
- workspace.control returns state INSIDE browser.run, where busy=true; finally clears busy only after returned state was captured.
- service.cjs attach always detach/park/reparent, then CDP metrics. Every view has backgroundThrottling:false; Linux parked offscreen views are necessary for capture.
- NativeBrowserPage.tsx polls state each second, ResizeObserver and window resize attach, global body subtree mutation observer scans every dialog for every chat mutation. Three header rows duplicate title and tabs; footer instructions always visible.
- ManyPanel.tsx chooses dense fullscreen composer based on isFullscreen, not actual panel width. ManyComposer includes capability/mode/model/reasoning/context controls and six shortcut hints.
- MarkdownRenderer external link button only contains children, no icon/destination. WebSearchResults uses bulky cards. CitationBadge and SourceReference have existing source navigation/pinning; SourceReference subscribes to entire Many store.
- ManyMessageView.tsx footers have opacity-0 group-hover/turn:opacity-100 without focus-within.
- ManyTurn is memo, but groupMessagesByRole creates new arrays every streaming token so all historical groups rerender.
- ui/message-scroller.tsx has exit400ms and translate/scale animations without reduced-motion. Existing shadcn chat primitives already support anchoring; KEEP them.
- Motion tokens in app/globals.css: --ease-out cubic-bezier(0.23,1,0.32,1), durations100/150/200ms. No motion dependency needed.

## Scope (only these families)
- electron/browser-native/{service,workspace,actions}.cjs and narrowly necessary new state-event helper in that directory; relevant existing browser-native tests under electron/__tests__, new focused native-browser performance test.
- electron/ipc/integrations/native-browser.cjs (locate existing actual path), electron/ipc/index.cjs ONLY if registration needs change; electron/preload.cjs; existing renderer IPC typings; docs generated IPC inventory if event added.
- app/components/browser/*, app/lib/browser/*, app/lib/store/browserWorkspaceStore.ts (locate actual casing), app/components/shell/ContentRouter.tsx.
- app/components/many/{ManyPanel,ManyHeader}.tsx; composer/{ManyComposer,ManyComposerInput,ManyComposerSurface}.tsx and narrowly necessary composed settings menu outside ui/; conversation/{ManyConversation,ManyTurn,ManyMessageView}.tsx and related tests.
- app/lib/hooks/useManyRunLifecycle.ts, app/lib/utils/groupMessagesByRole.ts (locate existing exact paths), associated tests only if needed for stable streaming groups.
- app/components/chat/{MarkdownRenderer,CitationBadge,SourceReference}.tsx, markdown-renderer.css, existing sources CSS, tool-card/{WebSearchResults,BrowserOpenResult}.tsx, and new shared web-link composition outside ui/. Relevant component tests.
- app/globals.css; app/components/ui/message-scroller.tsx ONLY motion fix preserving original primitive/API.
- packages/i18n/locales/{en,es,fr,pt}/ files containing existing many/native_browser/chat keys.
- eslint.config.mjs, package.json, pnpm-lock.yaml ONLY @shadcn/lint dependency/scoped lint integration and meaningful verification script.
- scripts/smoke-browser-workspace.cjs, scripts/smoke-native-browser.cjs and new focused reproducible UI/performance smoke if needed.
- docs/plans/active/many-browser-polish.md; docs/features existing native browser feature document if useful.
Out of scope: AI/provider SDK, DB/accounts/sync, cloud/browser extensions, external browser sessions, new windows, broad restyling of unrelated app surfaces. Do not remove functionalities or change user's profile/cookies.

## Git/tool workflow
Fresh attached worktree /Users/maxprain/.codex/worktrees/many-browser-polish/dome. Create feat/many-browser-polish from current origin/main. Install pnpm install --frozen-lockfile before adding @shadcn/lint; build workspace packages if tooling needs dist. Conventional commits. Commit when complete, but wait for reviewer before push/PR.
Apply shadcn skill: /Users/maxprain/.codex/worktrees/a58a/dome/.agents/skills/shadcn/SKILL.md. This is EXECUTION of advisor plans, not a new read-only improve invocation. The user's explicit request is implementation.
Official lint repo https://github.com/shadcn-ui/lint; primary docs no-restyle/no-raw-colors and import { plugin as shadcn } from '@shadcn/lint'. Verify installed exports. Use official docs/CLI for relevant Base UI components. Parent fetched buttons,input-group,tabs,tooltip,dropdown-menu,message-scroller,message,bubble docs. Keep project's preset/tokens, existing primitives and icon library.

## Steps
### 1. Separate allocation/show from network navigation
Validate public URL and domains before allocation. Allocate/coalesce URL request and selected tab, report session/tab/loading immediately after initial safe about:blank initialization, and notify renderer so browser surface shows BEFORE target load finishes. Async navigation emits state/error to authorized Dome renderer, never to web contents. Existing browser_open_in_dome tool can still await final rendered result if contract needs it. Capture originating conversation before async work, never attach to whichever chat happens to become active later. Every failure/cancel clears loading, reports error and keeps session usable.
Deduplicate exact normalized URL (new URL().href), including identical concurrent opens. Preserve query/fragment and avoid merging different resource URLs. Reuse existing tab, allow explicitly new blank tabs. Update old smoke that creates two equal URLs to use two distinct fixtures.
CRITICAL: do NOT attach debugger/CDP until first about:blank load completed; previous macOS segfault resulted from early CDP on uninitialized WebContents.
Verify node --check changed cjs and node --test relevant native-browser tests -> all pass. Add delayed-navigation regression proving immediate open notification before delayed fixture completes, repeated concurrent URL one tab, failure/cancel/URL guard intact.

### 2. Reduce native browser work, preserve overlays/capture
Make attach idempotent: same session/tab/window/bounds does nothing; same hosted view new bounds only setBounds + one viewport update (no remove/add/park). Coalesce ResizeObserver/viewport updates one animation frame and actual final bounds; don't reset to default viewport just to detach then reattach.
Set inactive user tabs background throttling true, visible/agent capture/navigation/recording tabs awake while needed. Preserve Linux offscreen capture host and agent/download safety.
Fix workspace.control busy result after awaited run completes. Human navigation loading must not incorrectly announce Many activity.
Replace idle polling with main->renderer state events (navigation/title/loading/tab/share busy changes), initial state read, cleanup when inactive. Avoid unnecessary object state updates. Overlay safety must remain: only schedule scans for relevant portal/dialog node/attribute changes, not every streaming text mutation; show browser again on modal close.
Verify deterministic tests for attach/add/remove/CDP counts, busy after awaited control, background tab awake/asleep transitions, state event cleanup. Run Electron smoke against deterministic local fixtures -> persistence/share/isolation/keyboard/tab operations still pass.

### 3. Calm browser chrome and make every web link inviting
NativeBrowserPage: at most two chrome rows (compact tabs+panel controls; navigation/address). Avoid duplicated title/profile badges; profile/cookie explanation accessible in tooltip/help. Keep back/forward/reload/stop, address/search, tabs new/select/close, external open explicit, expand/collapse, close, share/unshare. Footer brief state+primary Continue with Many button, not persistent paragraph.
Links: real anchor href + preventDefault in Dome for http(s), inline small Hugeicons open/browser icon, visible focus, destination tooltip/title/domain. Click and Enter must immediately open/show selected Dome browser. Preserve dome://, resource/citation/internal routes, mailto existing behavior. No nested interactive elements.
Search/source references compact coherent title/domain/icon rows; detail/excerpts progressively available. Preserve citations exact page/section and resource pin behavior. Narrow Zustand selectors for SourceReference. No fetching third-party favicons needed.
Verify existing/new renderer tests, Enter/click routing, internal routes and source pin. Read visual fixtures at wide/split/narrow, no horizontal overflow.

### 4. Adapt chat composition to actual width
Maintain MessageScroller/Message/Bubble APIs and their streaming anchoring. Header single clear title, new/chat/browser/menu actions; remove meaningless duplicate subtitle/unused badges. Fullscreen chat must look calm inside narrow split too.
Composer: keep attach/capabilities, model and send central; mode/reasoning/context/settings available through compact accessible progressive controls/menu. Use container queries/ResizeObserver based on composer width (not window/isFullscreen), no overflowing rows. Keyboard legend under help/tooltip or only genuinely useful wide/focused state, not six permanent shortcuts. Existing attachments/mentions/skills/MCP/slash/dropzones/workflow/model/reasoning/context remain functional. Keep user's draft and running chat mounted across browser open/close/expand.
Preserve stable historical turn identities during streaming; unchanged old turns must not rerender on every newest token, but historical tool results/citations genuinely updated must render. Prefer stable groups or carefully complete memo comparator, never compare IDs alone.
Verify typecheck + focused Many tests. Add render-count regression for unchanged old turn and updated old tool/source. Visual checks chat wide, ~400px panel, stacked narrow workspace, settings keyboard accessible, draft preserved.

### 5. Fix frequent motion/accessibility
Message action footers visible on focus-within and hoverless pointers. Jump-to-end uses opacity only 100–150ms linear/ease-out, no frequent translate/scale; reduced-motion no spatial movement, preserve focus/anchoring. Many panel transition disabled under reduced-motion. No width/height animations on native split. Optional panel opacity<=150ms; frequent controls immediate. Scoped direct styles, no parent hover driving arbitrary child presentation.
Verify prefers-reduced-motion computed styles and keyboard focused action visibility, streaming scroll stays anchored, intentional scroll-up does not yank to end.
Read motion subplans supplied below; implement exact constraints.

### 6. Integrate official shadcn lint and validate
pnpm add -D @shadcn/lint. Flat config scoped to changed browser/Many/link compositions, not giant unrelated migration. Use no-raw-colors/no-restyle/no-arbitrary-values/no-inline-styles where meaningful, appropriate documented contracts for layout/geometry. Real WebContentsView dimensions and measured chat width inline geometry can use explicit narrow rule exemption; avoid blanket all rules off. UI primitives themselves exempt no-restyle as upstream recommends. Do not hide styling violations behind arbitrary custom classes merely to appease lint.
Document copied execution plan and actual validation evidence under docs/plans/active/many-browser-polish.md. No claims that STUN logs prove UI lag.
Run all mandatory checks:
pnpm run typecheck
pnpm run lint
pnpm run test:ui
pnpm run check:guardrails
pnpm run check:sonar-patterns -- --diff=origin/main
pnpm run check:ipc-inventory
pnpm run check:remote-protocol
pnpm run build
pnpm run depcruise
also pnpm run check:main-syntax and focused native-browser tests + Electron fixture smoke after build. All expected exit0; report honest baseline failures and never weaken checks.

## Done criteria
- Browser appears during delayed URL loading; same-source clicks select one tab, not many.
- Exact repeated attach no reparent/CDP; resize applied without churn, dialog overlay remains safe.
- No idle 1-second state polling / full transcript mutation scans.
- Historical turns stay unchanged while newest tokens stream; changed history correctly updates.
- All tools/session/credentials/sharing isolation preserved; errors explicit, no silent catches.
- Links have visible icon and destination, activate inside Dome by click/Enter.
- Wide/narrow chat and browser no overflow, all settings reachable, minimal permanent chrome.
- Motion/focus/reduced-motion behavior verified against actual UI.
- Official lint plugin enabled with meaningful scoped rules; nine checks and focused tests pass.
- Scope clean, conventional commit; reviewer handles index and PR.

## STOP conditions
Report if drift fundamentally changes named contracts, a genuine fix requires out-of-scope changes, Linux capture cannot be preserved, first-load CDP safety cannot be maintained, or mandatory check fails twice after reasonable fixes. Explain rather than silently broaden scope.

## Maintenance
Review event listener disposal, cancellation and navigation races; array memo must include real content changes. Search-engine WebRTC logs remain third-party diagnostics without measured causality. Don't report performance percentages without before/after traces.


## Implementation decisions and validation

Native opening returns the allocated loading page before network navigation. State events replace idle polling. Identical bounds reuse the hosted view; parked pages retain metrics, and idle saved pages are hidden while retaining the shell compositor. This is not a claim that Chromium STUN logs caused lag or that background throttling alone reduces CPU. Chat settings are available in a popover at all widths; Plan/Draft stays visible in the same composer row, and the settings control reports the current mode/reasoning in its accessible label and tooltip. Source buttons use primitive variants and source subscriptions select only pins/actions. The official @shadcn/lint enforces primitive ownership, token values, inline styles and raw colors on the refreshed browser, composer, citations and source compositions; other legacy surfaces retain the existing lint baseline. InputGroupAddon spacing is an explicit layout contract.

Mandatory gates passed: typecheck, lint (zero errors; existing warnings retained), test:ui (137 files / 559 tests), check:guardrails, check:sonar-patterns against origin/main, check:ipc-inventory, check:remote-protocol, build and depcruise. check:main-syntax also passed. Focused main fixtures: 14 tests passed; renderer regressions cover historical regrouping, actual tool updates, malformed source URLs and origin conversation races. Electron workspace fixture passed saved login cookies, isolated sharing, persistence and cleanup. Native fixture passed background keyboard, files, frames, screenshots and stale snapshots.

The reproducible `scripts/smoke-browser-polish.cjs` held its HTTP response until opening returned: allocation 162 ms with loading=true, five clicks produced one tab, 50 identical attaches produced zero add/remove/viewport calls, and control resolved with busy=false. Reviewer independently measured the prior code at 1398 ms with loading=false, 100 add/remove/viewport calls for the same 50 attaches, busy=true, and two tabs for a repeated URL. These timings describe the local fixture, not an Internet speed or CPU guarantee.

Independent Electron UI review verified immediate panel display while the HTTP response was withheld, native page painting, split/stacked layouts, selected session handoff, draft preservation, overlay parking/recovery and reduced-motion jump styling. Closed sidebar Many now retains parent hooks/draft/run state while rendering no hidden transcript or composer. Browser workspace performance tests and the polish smoke are added to the existing Linux Woodpecker fixture steps; no pipeline restructuring.
