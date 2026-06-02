# Dome AI Prompts

External prompts organized by surface. Structure follows **MiniMax M-series** section labels: Role, Context, Constraints, ToolUse, OutputFormat, Reference, Source, Task.

## Architecture

| Layer | Location | Role |
| ----- | -------- | ---- |
| **Assembler** | [`shared/prompt-assembler/`](../shared/prompt-assembler/index.cjs) | Single source of truth for section order |
| **Core sections** | [`martin/core/*.txt`](martin/core/) | Stable prefix (cache-friendly) |
| **Lazy docs** | [`martin/*.txt`](martin/) + `dome_load_doc` | Long bodies loaded on demand |
| **Renderer loader** | [`app/lib/prompt-assembler/coreSections.ts`](../app/lib/prompt-assembler/coreSections.ts) | Vite `?raw` imports |
| **Main loader** | [`electron/core-prompt-loader.cjs`](../electron/core-prompt-loader.cjs) | `readPrompt` from disk |

Prompt version for bench A/B: `PROMPT_VERSION` in `shared/prompt-assembler` (currently `minimax-v1`).

## Surfaces

| Folder / file | Surface | Consumer |
| ------------- | ------- | -------- |
| **martin/core/role-many.txt** | Many persona (Role) | `buildManyFloatingPrompt()`, agent chat default |
| **martin/core/** | Tool guardrails, app context, output format | `buildDomeSystemPrompt()` |
| **martin/tools.txt** | Generated index of core tool sections | `pnpm run build:tools-index` |
| **martin/subagents/** | Deep subagent Role prompts | `electron/subagent-specs.cjs` |
| **martin/team-supervisor.txt** | Agent Team supervisor | `electron/ipc/agent-team.cjs` |
| **editor/** | Note editor AI | `app/lib/ai/editor-ai.ts` |
| **studio/** | Learn / Studio generation | `useStudioGenerate.ts` |

## On-demand reference docs (`dome_load_doc`)

IDs (all 12): `entity_rules`, `artifacts`, `artifact_persisted`, `artifact_design`, `feeders`, `resource_links`, `ppt_tool`, `docx_tool`, `calendar_tool`, `flashcard_tool`, `excel_notebook_tool`, `excel_artifact_tool`.

Handler: [`electron/prompt-sections.cjs`](../electron/prompt-sections.cjs).

## Editing workflow

1. Edit the relevant `.txt` under `prompts/`.
2. If you changed `martin/core/*` tool sections, run `pnpm run build:tools-index` to refresh `martin/tools.txt`.
3. Bump `PROMPT_VERSION` in `shared/prompt-assembler/index.cjs` when semantics change; record in [`CHANGELOG.md`](CHANGELOG.md).
4. Compare bench runs: `pnpm run bench:compare -- --a <runA> --b <runB>`.

## Deprecated

- **martin/base.txt** — legacy placeholders; use `core/role-many.txt` + volatile Source block.
- **martin/floating-base.txt** — alias deprecated; use `core/role-many.txt`.

## Placeholders

### editor/system.txt

- `{{contextSnippet}}` — document excerpt (Source)
- `{{actionInstruction}}` — editor action (Task)

### martin/team-supervisor.txt

- `{{agentList}}`, `{{supervisorInstructions}}`
