/**
 * @dome/prompts — assembler.
 *
 * Phase 4: re-exports the legacy `shared/prompt-assembler/index.cjs` so that
 * callers can import the assembler from `@dome/prompts` while the real body
 * remains the source of truth (byte-identical output, no risk of drift).
 *
 * The port of the assembler body to TypeScript happens in a follow-up; for
 * now this is a thin facade that preserves the existing call shape and
 * runtime behavior.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const legacy = require('../../../shared/prompt-assembler/index.cjs') as Record<string, unknown>;

// Re-export the public surface 1:1.
export const CORE_SECTION_KEYS: readonly string[] = (legacy.CORE_SECTION_KEYS as readonly string[]) ?? [];
export const buildCoreToolsBlock: (sections: Record<string, string>) => string =
  legacy.buildCoreToolsBlock as (sections: Record<string, string>) => string;
export const buildDomeSystemPrompt: (...args: unknown[]) => string =
  legacy.buildDomeSystemPrompt as (...args: unknown[]) => string;
export const buildEditorPrompt: (...args: unknown[]) => string =
  legacy.buildEditorPrompt as (...args: unknown[]) => string;
export const buildStudioPrompt: (...args: unknown[]) => string =
  legacy.buildStudioPrompt as (...args: unknown[]) => string;
export const buildSubagentPrompt: (...args: unknown[]) => string =
  legacy.buildSubagentPrompt as (...args: unknown[]) => string;
export const buildBenchPrompt: (...args: unknown[]) => string =
  legacy.buildBenchPrompt as (...args: unknown[]) => string;
export const buildVoiceSuffix: (...args: unknown[]) => string =
  legacy.buildVoiceSuffix as (...args: unknown[]) => string;
export const applyTemplate: (template: string, vars: Record<string, unknown>) => string =
  legacy.applyTemplate as (template: string, vars: Record<string, unknown>) => string;
export const formatVolatileSourceContext: (...args: unknown[]) => string =
  legacy.formatVolatileSourceContext as (...args: unknown[]) => string;
export const todayEnLong: (...args: unknown[]) => string =
  legacy.todayEnLong as (...args: unknown[]) => string;
