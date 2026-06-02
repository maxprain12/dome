/**
 * Re-exports from shared prompt assembler (TypeScript — Vite-native ESM).
 */
export {
  PROMPT_VERSION,
  DOME_LOAD_DOC_IDS,
  DOME_LOAD_DOC_DESCRIPTION,
  buildDomeSystemPrompt as buildDomeSystemPromptFromCore,
  buildVoiceSuffix,
  formatVolatileSourceContext,
  buildSubagentPrompt,
  buildEditorPrompt as buildEditorPromptFromTemplate,
  buildStudioPrompt as buildStudioPromptFromTemplate,
  buildBenchPrompt as buildBenchPromptFromOptions,
} from '../../../shared/prompt-assembler/index.ts';

export type {
  CorePromptSections,
  DomeSystemPromptOptions,
  VolatileSourceOptions,
  BenchPromptOptions,
} from '../../../shared/prompt-assembler/index.ts';
