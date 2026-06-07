// @dome/prompts public API
// Prompt sections + the system-prompt assembler.
//
// Phase 4: this package is the canonical home for the system-prompt
// assembler. The assembler body now lives here as a real TypeScript
// implementation (`assembler.ts`) — a pure function over caller-supplied
// core sections — rather than a thin re-export of the legacy CommonJS
// build. Output is byte-identical to `shared/prompt-assembler/index.cjs`
// (verified by `scripts/test-dome-prompts.mjs`).

export type {
  AssembleOptions,
  SkillSummary,
  PromptVersion,
  CorePromptSections,
  DomeSystemPromptOptions,
  VolatileSourceOptions,
  BenchPromptOptions,
  DomeLoadDocId,
} from './types.js';

export { PROMPT_VERSION, DOME_LOAD_DOC_IDS, DOME_LOAD_DOC_DESCRIPTION } from './types.js';

// The system-prompt assembler — package-owned TypeScript implementation.
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
