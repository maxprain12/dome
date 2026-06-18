# design-sync NOTES — Dome

## Repo shape
- Dome is an **Electron app**, NOT a published component library. No library `dist/` (the `dist/` is the bundled renderer SPA). Converter runs in **synth-entry mode** off source (`app/components`).
- Path alias: `@/*` → `./app/*` (tsconfig.json, has comments → not plain-JSON parseable).
- Design tokens: `app/globals.css` (225 CSS custom properties; light/dark via `[data-theme]`). This is `cfg.cssEntry`.
- Stack: Vite + React 18 + Mantine UI + lucide-react + Tailwind + CSS variables.

## Component landscape (459 .tsx total)
- The **real design system** is `app/components/ui/index.ts` — a clean barrel of ~46 `Dome*`/`Hub*` primitives WITH prop-type exports. These are presentational and render in isolation.
- The other ~400 are **feature components**: 92 call `window.electron` IPC directly, 106 import Zustand/Jotai stores → cannot render standalone without the Electron+IPC+store runtime.
- Even inside `ui/`, a few are coupled: `Toast`→store, `ThemeProvider`→store+IPC, `PromptModal`→store, `WindowControls`→IPC. May need `cfg.provider` / mock or show floor/broken.

## Scope decision (this run)
- User chose "attempt all 459" knowing most will render broken. Strategy: ship what actually renders (the `ui/` primitives first), floor/flag the rest, report what survived. Do NOT push broken cards.

## Build pipeline (how the working build was achieved)
- **Entry**: `cfg.entry = app/components/ui/index.ts` (the public barrel — gives correct named exports incl. `default as X`). PKG_DIR resolves to repo root (has package.json name "dome"), avoiding the `node_modules/dome` self-resolve crash.
- **Discovery**: `cfg.componentSrcMap` enumerates all 46 ui exports → drives component list + per-component `.d.ts` + cards. (Synth-from-srcDir is NOT used; it'd miss default exports.)
- **Bundle tsconfig**: `cfg.tsconfig = .design-sync/tsconfig.bundle.json`. The converter's pathsPlugin reads THIS file's `compilerOptions.paths` directly (does NOT follow `extends`), so it duplicates the real `@/` aliases AND:
  - Stubs Node/Electron builtins (`path`,`os`,`fs`,`electron`,`better-sqlite3`,…) → `.design-sync/stubs/node-empty.ts` (callable Proxy). Renderer code imports these only via `@/lib/utils` barrel (`export * from './paths'`). All default imports, so a default-only stub works.
  - Exact entries `@/lib/utils` & `@/types` → their `index.ts` (the wild-rule plugin otherwise returns the directory → esbuild "is a directory").
  - `@/lib/i18n` → `.design-sync/stubs/i18n.ts` — the real i18n uses `import.meta.glob` (Vite macro) which throws in the IIFE and aborts the WHOLE bundle (→ window.Dome never assigned, all cards fail). Stub inits i18next minimally so react-i18next renders (missing keys fall back to key text).
- **CSS** (`cfg.cssEntry = .design-sync/app-styles.css`, GENERATED): the compiled app stylesheet `dist/assets/index-*.css` (Tailwind utilities + tokens) + `.design-sync/tokens/theme-light.css` (light tokens forced onto plain `:root`). The app normally gates tokens under `:root[data-theme="light"]`; previews/designs have no `data-theme`, so without the `:root` override every `var(--accent)` is empty and components render unstyled. Regenerate with `node .design-sync/gen-css.mjs` after `pnpm build`.

## Re-sync risks
- **cssEntry is GENERATED & dist-hash-bound**: `.design-sync/app-styles.css` embeds `dist/assets/index-<hash>.css`. On re-sync: `pnpm build` → `node .design-sync/gen-css.mjs` (auto-picks the index-*.css by glob) BEFORE the converter. If app styling changed and you skip this, designs render with stale CSS.
- **theme-light.css is generated** from `app/globals.css`'s `:root[data-theme="light"]` block (`node` snippet in git history / regen by extracting that block). If the palette changes, regenerate it.
- **i18n/node stubs neutralize real behavior**: cards show i18n KEYS for components with internal `t()` (acceptable; structure/styling is the point). If Dome adds renderer components that genuinely need Node APIs at render, they'll render degraded.
- **Fonts**: `[FONT_MISSING]` for Inter/JetBrains Mono/Fira Code/Source Serif — Google fonts, no shipped @font-face. Currently system fallback. TODO: wire a Google Fonts `@import` into app-styles.css or accept substitutes.
- **Scope**: only the 46 `ui/` barrel primitives are synced. The other ~400 feature components are IPC/store-coupled and excluded.

## Final state (first sync, 2026-06)
- Project: **Dome Design System** `c2bfdf34-84e7-4b37-b8a4-e214ba2fa6a3`. 46 components synced; 42 authored previews (all graded good), 4 deliberate floor cards: PromptModal, ThemeProvider, ToastContainer, UpdateAlertBanner (state/IPC-coupled, no visual without runtime — authorable later with mock wrappers if needed).
- Conventions header authored at `.design-sync/conventions.md` (→ README via `readmeHeader`).
- DomeModal/ConfirmDialog use `cfg.overrides.cardMode=single` (overlays).
- DomeContextMenu renders trigger-only (menu opens on click — no controlled-open prop; can't show open statically).

## Regenerating GENERATED build inputs (do this on re-sync, before the converter)
1. `pnpm build` (produces fresh `dist/assets/index-*.css`).
2. `node .design-sync/gen-css.mjs` → regenerates `.design-sync/app-styles.css` (compiled CSS + :root light tokens).
3. Regenerate the i18n resources if locales changed:
   `node -e 'const fs=require("fs"),p=require("path");const d="packages/i18n/locales/es";const o={};for(const f of fs.readdirSync(d)){if(f.endsWith(".json"))o[f.replace(/\.json$/,"")]=JSON.parse(fs.readFileSync(p.join(d,f),"utf8"))}fs.writeFileSync(".design-sync/stubs/i18n-es.json",JSON.stringify(o))'`
4. Regenerate `.design-sync/tokens/theme-light.css` only if `app/globals.css` `:root[data-theme="light"]` block changed (extract that block, rewrite selector to `:root`).

## Known render warns (triaged legitimate)
- `[FONT_MISSING]` — see above; system fallback accepted for now.
- `[TOKENS_MISSING]` ~9 vars (--dome-bg-secondary, --destructive, --accent-soft, tt-dropdown-*) — runtime-injected or component-local; non-blocking.
