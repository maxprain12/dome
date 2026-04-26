/**
 * Canonical system-prompt assembler for every Dome chat surface.
 *
 * Produces a deterministic string with a fixed section order:
 *   1. Base instructions (caller-provided; Many floating, agent instructions, team supervisor...)
 *   2. Resource / navigation link rules
 *   3. Artifact emission rules (prompts/martin/artifacts.txt)
 *   4. Tool philosophy (prompts/martin/tools.txt)
 *   5. Entity creation rules
 *   6. Single tool-usage mode block
 *   7. Citation guidance
 *   8. Current date (optional)
 *   9. Skills markdown (optional)
 *  10. Pinned resources (optional, caller passes already-rendered block)
 *  11. Active skill (optional)
 *  12. Voice suffix (optional)
 *
 * The goal is a single source of truth so Many, Agent Chat, Agent Team
 * and WhatsApp never diverge on whether artifact/tool/entity rules are
 * present.
 */

import { prompts } from '@/lib/prompts/loader';
import {
  RESOURCE_LINK_INSTRUCTION,
  ENTITY_CREATION_RULES,
  TOOL_USAGE_MODE,
  CHAT_CITATION_INSTRUCTION,
  buildVoiceSuffix,
} from './systemPrompts';

export type DomeSystemPromptOptions = {
  /** Caller-provided base prompt: Many floating, agent.systemInstructions, supervisor, etc. */
  baseInstructions: string;
  /** Include current date (english long form). Defaults to true. */
  includeDate?: boolean;
  /** Extra pre-rendered blocks appended in order between the rules and voice suffix. */
  extraSections?: Array<string | null | undefined>;
  /** Optional markdown describing pinned resources (already formatted by caller). */
  pinnedResourcesMarkdown?: string | null;
  /** Optional markdown with the active skill description (already formatted). */
  activeSkillMarkdown?: string | null;
  /** If present, appends the voice-response suffix tailored to the language. */
  voiceLanguage?: string | null;
  /** Skip the Citation Guidance section (legacy Many passes its own variant). */
  omitCitationGuidance?: boolean;
  /** Skip the Tool Usage Mode block (rare — only when caller already provides one). */
  omitToolUsageMode?: boolean;
  /** Skip the Entity Creation block (e.g. read-only agents). */
  omitEntityRules?: boolean;
};

function todayEnLong(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function buildDomeSystemPrompt(options: DomeSystemPromptOptions): string {
  const sections: string[] = [];

  const base = (options.baseInstructions || '').trim();
  if (base) sections.push(base);

  sections.push(RESOURCE_LINK_INSTRUCTION);
  sections.push(prompts.martin.artifacts);
  sections.push(prompts.martin.tools);

  if (!options.omitEntityRules) sections.push(ENTITY_CREATION_RULES);
  if (!options.omitToolUsageMode) sections.push(TOOL_USAGE_MODE);
  if (!options.omitCitationGuidance) sections.push(CHAT_CITATION_INSTRUCTION);

  if (options.includeDate !== false) {
    sections.push(`Current date: ${todayEnLong()}.`);
  }

  if (Array.isArray(options.extraSections)) {
    for (const extra of options.extraSections) {
      if (typeof extra === 'string' && extra.trim().length > 0) {
        sections.push(extra.trim());
      }
    }
  }

  if (options.pinnedResourcesMarkdown && options.pinnedResourcesMarkdown.trim()) {
    sections.push(options.pinnedResourcesMarkdown.trim());
  }

  if (options.activeSkillMarkdown && options.activeSkillMarkdown.trim()) {
    sections.push(options.activeSkillMarkdown.trim());
  }

  let assembled = sections.join('\n\n');

  if (options.voiceLanguage) {
    assembled += buildVoiceSuffix(options.voiceLanguage);
  }

  return assembled;
}

export { RESOURCE_LINK_INSTRUCTION, ENTITY_CREATION_RULES, TOOL_USAGE_MODE, CHAT_CITATION_INSTRUCTION, buildVoiceSuffix };
