// @dome/prompts public API
// Prompt sections + the system-prompt assembler.
//
// Phase 4: this package is the canonical home for every piece of prompt
// text and for the logic that assembles a system prompt from sections.
// The actual file contents (`sections/**`) live next to the package.
// Runtime access is currently delegated to the legacy CommonJS modules
// (`shared/prompt-assembler/index.cjs`, `electron/core-prompt-loader.cjs`,
// `electron/prompt-sections.cjs`, `electron/prompt-budget.cjs`); the body
// of the assembler will be ported to TypeScript in a follow-up commit so
// callers can `import { assembleSystemPrompt } from '@dome/prompts'`
// instead of `require('shared/prompt-assembler')`.

export type {
  AssembleOptions,
  SkillSummary,
  PromptVersion,
} from './types.js';

export { PROMPT_VERSION, DOME_LOAD_DOC_IDS, DOME_LOAD_DOC_DESCRIPTION } from './types.js';

// Re-export the public surface of the legacy assembler so that consumers
// can import it from `@dome/prompts` (one canonical entry point). The
// real body still lives in `shared/prompt-assembler/index.cjs`; this is
// a thin re-export.
export {
  buildCoreToolsBlock,
  buildDomeSystemPrompt,
  buildEditorPrompt,
  buildStudioPrompt,
  buildSubagentPrompt,
  buildBenchPrompt,
  buildVoiceSuffix,
  applyTemplate,
  formatVolatileSourceContext,
  todayEnLong,
  CORE_SECTION_KEYS,
} from './assembler.js';
