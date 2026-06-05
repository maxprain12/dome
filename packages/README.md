# `packages/` — Dome monorepo (Phase 0 workspace scaffold)

> Status: **Phase 0 — additive workspace scaffold, zero behavior change.** This directory
> exists alongside the root app (`electron/` + `app/`); nothing in those trees has moved
> yet. The workspace glob now matches **both** `.` (the existing root app) and `packages/*`
> (the new scaffolds), so the strangler can run with the app staying green at every step.

## Packages (Phase 0)

| Package | Owns | Boundary | Node-only? |
| --- | --- | --- | --- |
| [`@dome/ai`](./ai) | Multi-provider LLM (OpenAI / Anthropic / Google / Ollama / OpenRouter / Copilot) | leaf | **yes** |
| [`@dome/agent-core`](./agent-core) | `runAgentLoop`, hooks, session, compaction, skills (LangGraph replacement) | deps: `@dome/ai`, `@dome/tools`, `@dome/prompts` | **yes** |
| [`@dome/tools`](./tools) | Tool registry (one module per tool family) | deps: `@dome/ai` | **yes** (execution); schema is renderer-safe |
| [`@dome/prompts`](./prompts) | Prompt sections + system-prompt assembler | leaf | **yes** (used by main) |
| [`@dome/i18n`](./i18n) | Translations, language × namespace | leaf | **no** — renderer-safe (the only @dome/* the renderer can import at runtime) |
| `@dome/app` | Electron shell + renderer (composition root) | **stays at the root** for now | n/a |

`@dome/app` is **not** created in Phase 0. The Electron app stays at the repo root
(`electron/` + `app/`) and consumes the new packages as they fill in. See
[`../longrunning-task/packages/dome-app.md`](../longrunning-task/packages/dome-app.md) for
the Phase 7 decision (default: stay at root).

## Why these five packages only

The Phase 0 spec scaffolds the five leaf-and-near-leaf packages that the graph in
[`02-target-architecture.md`](../longrunning-task/02-target-architecture.md) needs to be
buildable. `@dome/app` is deferred to Phase 7 so we don't churn build scripts,
`electron-builder` paths, and the asar config during the strangler.

## Boundary rule (R9)

The renderer (`app/**`) **must not** import the Node-only packages `@dome/ai`,
`@dome/agent-core`, `@dome/tools`, or `@dome/prompts`. The only `@dome/*` package the
renderer can pull from at runtime is `@dome/i18n`. Other packages may be imported **as
types** (e.g. `import type { Foo } from '@dome/ai'` is fine when `Foo` is a type-only
export — once those packages have real exports).

This is enforced by the existing custom ESLint rule
[`tools/eslint-plugin-dome/rules/no-renderer-node-imports.cjs`](../tools/eslint-plugin-dome/rules/no-renderer-node-imports.cjs),
which the root `eslint.config.mjs` already loads. The rule now also reports an R9
diagnostic when it sees a `import … from '@dome/ai'` (or siblings) in `app/`.

## Project references

Each package's `tsconfig.json` sets `composite: true` and (where appropriate) lists
`references` to the siblings it depends on, matching the dependency graph in
`02-target-architecture.md`:

| Package | References |
| --- | --- |
| `@dome/ai` | — |
| `@dome/i18n` | — |
| `@dome/prompts` | — |
| `@dome/tools` | `@dome/ai` |
| `@dome/agent-core` | `@dome/ai`, `@dome/prompts`, `@dome/tools` |

The **root** `tsconfig.json` is **not** composite (it uses `noEmit: true` for the
renderer / Vite pipeline). We deliberately do **not** add root-level project references
in Phase 0 — that's a more invasive change. The root typecheck (`pnpm run typecheck`)
still scans `app/**` and `shared/prompt-assembler/index.ts` exactly as before. When the
packages grow real code and the root wants to consume them via project references, we
will add the references then.

## Verification

From the repo root, the following commands must continue to pass after this change
(zero behavior delta):

```bash
pnpm install --frozen-lockfile     # workspace resolves '.' + 'packages/*'
pnpm -r build                       # builds the five new packages (no code yet, just composite)
pnpm -r test                        # no-op per package for now
pnpm run typecheck                  # renderer + shared — unchanged
pnpm run lint                       # runs the R9 rule over app/ — must stay green
pnpm run electron:dev               # unchanged: vite + electron, smoke start
```

The same gate is recommended for CI (see `.github/workflows/ci.yml`); if a `packages`
build is added there, it should run **after** the existing typecheck/lint/build jobs so
that an empty-skeleton regression never blocks the rest of the pipeline.

## Lint rule (R9) — how it was added

The repo already has a custom ESLint plugin at
[`tools/eslint-plugin-dome/`](../tools/eslint-plugin-dome/) with the
`no-renderer-node-imports` rule. The rule was extended (same file, additive change) to
also report an R9 message when an `import` or `require` in the renderer targets
`@dome/ai`, `@dome/agent-core`, `@dome/tools`, or `@dome/prompts`. We **did not** invent a
new lint system; we reused the repo's existing one.

## What Phase 0 does **not** do

- No code is moved. `electron/`, `app/`, `shared/`, `prompts/` are untouched.
- No dependency is added to the root `package.json`.
- No `.cjs` → `.ts` conversion.
- No new GitHub Actions workflow is added (the existing `ci.yml` keeps running the same
  typecheck/lint/build/depcruise/architecture-check gates; the five new packages have
  empty `tsc -b` skeletons and `echo "no tests yet" && exit 0` test scripts, so adding
  them to CI is a no-op until they have real code).
- No root `tsconfig.json` is changed.
- No file is named "harness" inside `@dome/agent-core/` (preserved naming rule; see the
  `dome-agent-core.md` spec for the rationale around `electron/harness-*.cjs`).
