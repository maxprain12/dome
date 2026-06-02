/**
 * Canonical system-prompt assembler for every Dome chat surface (renderer).
 *
 * Stable prefix order (MiniMax M-series):
 *   Role → Constraints → Context → ToolUse → OutputFormat → Reference
 *   → skills → Source (date + volatile) → extras → voice suffix
 */

import { getCoreSectionsForAssembler } from '@/lib/prompt-assembler/coreSections';
import {
  buildDomeSystemPromptFromCore,
  buildVoiceSuffix,
  formatVolatileSourceContext,
  PROMPT_VERSION,
  type DomeSystemPromptOptions,
  type VolatileSourceOptions,
} from '@/lib/prompt-assembler/bridge';

export type { DomeSystemPromptOptions, VolatileSourceOptions };
export { buildVoiceSuffix, formatVolatileSourceContext, PROMPT_VERSION };

export function buildDomeSystemPrompt(options: DomeSystemPromptOptions): string {
  return buildDomeSystemPromptFromCore(options, getCoreSectionsForAssembler());
}

/** Default Many persona (Role section). */
export function buildManyRolePrompt(): string {
  return getCoreSectionsForAssembler().roleMany?.trim() || '';
}
