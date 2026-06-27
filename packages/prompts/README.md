# `@dome/prompts`

Prompt sections, surface templates, and assembler logic.

## Layout

| Directory | Purpose |
| --------- | ------- |
| [`sections/`](sections/) | Core system prompt sections (role, guardrails, tool catalog, entity rules, capabilities, generated `tools-index.txt`) |
| [`surfaces/`](surfaces/) | Surface-specific templates (Many subagents, Agent Team, **editor**, **studio**, **kb-wiki**) |
| [`src/`](src/) | TypeScript assembler (`assembleSystemPrompt`, `buildDomeSystemPrompt`, …) |

Operational tool guides live in **`@dome/tools/src/domains/<domain>/prompt*.txt`** and are loaded via `dome_load_doc` (see [`manifest.ts`](../tools/src/domains/manifest.ts)).

## Consumers

- **Main process**: [`electron/prompts/tool-prompt-loader.cjs`](../../electron/prompts/tool-prompt-loader.cjs), [`electron/prompts/prompts-loader.cjs`](../../electron/prompts/prompts-loader.cjs)
- **Renderer**: [`app/lib/prompt-assembler/coreSections.ts`](../../app/lib/prompt-assembler/coreSections.ts) (Vite `?raw` — do not import `@dome/prompts` in `app/`)

Leaf package (no runtime deps). Spec tracker: [`longrunning-task/packages/dome-prompts.md`](../../longrunning-task/packages/dome-prompts.md) (if present).
