/**
 * Canonical system-prompt assembler for every Dome chat surface.
 *
 * Emits a deterministic string optimized for provider prompt caching (stable prefix first):
 *   1. staticPersona (Many persona, agent instructions, supervisor template…)
 *   2. App section guide (APP_SECTION_GUIDE)
 *   3. Resource / navigation link rules
 *   4. Artifact emission rules (prompts/martin/artifacts.txt)
 *   5. Tool limits + catalog summary (prompts/martin/tools.txt)
 *   6. Entity creation rules (marketplace, workflows, automations)
 *   7. Tool usage mode
 *   8. Citation guidance
 *   9. Optional skills catalog markdown (Many — load_skill list)
 *  10. Current date
 *  11. Volatile session context (UI, pinned, memory, resource body, path/active skills)
 *  12. Extra sections (e.g. resource tool hints)
 *  13. Voice suffix (optional)
 */

import { prompts } from '@/lib/prompts/loader';
import {
  RESOURCE_LINK_INSTRUCTION,
  ENTITY_CREATION_RULES,
  TOOL_USAGE_MODE,
  CHAT_CITATION_INSTRUCTION,
  APP_SECTION_GUIDE,
  buildVoiceSuffix,
} from './systemPrompts';

export type DomeSystemPromptOptions = {
  /** Stable persona / role text (no per-session UI context). */
  staticPersona: string;
  /** Per-request context appended after the cache-friendly prefix (date, UI, resources, memory). */
  volatileContext?: string | null;
  /** Many only: filtered skill catalog lines (injected before volatile context, after citation). */
  skillsCatalogMarkdown?: string | null;
  /** Include current date (english long form). Defaults to true. */
  includeDate?: boolean;
  /** Extra pre-rendered blocks appended after volatile context (e.g. resource tool hints). */
  extraSections?: Array<string | null | undefined>;
  /** If present, appends the voice-response suffix tailored to the language. */
  voiceLanguage?: string | null;
  /** Skip the Citation Guidance section (legacy callers that pass their own variant). */
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

  const persona = (options.staticPersona || '').trim();
  if (persona) sections.push(persona);

  sections.push(APP_SECTION_GUIDE);
  sections.push(RESOURCE_LINK_INSTRUCTION);
  sections.push(prompts.martin.artifacts);
  sections.push(prompts.martin.tools);

  if (!options.omitEntityRules) sections.push(ENTITY_CREATION_RULES);
  if (!options.omitToolUsageMode) sections.push(TOOL_USAGE_MODE);
  if (!options.omitCitationGuidance) sections.push(CHAT_CITATION_INSTRUCTION);

  const catalog = options.skillsCatalogMarkdown?.trim();
  if (catalog) sections.push(catalog);

  if (options.includeDate !== false) {
    sections.push(`Current date: ${todayEnLong()}.`);
  }

  const volatile = options.volatileContext?.trim();
  if (volatile) sections.push(volatile);

  if (Array.isArray(options.extraSections)) {
    for (const extra of options.extraSections) {
      if (typeof extra === 'string' && extra.trim().length > 0) {
        sections.push(extra.trim());
      }
    }
  }

  let assembled = sections.join('\n\n');

  if (options.voiceLanguage) {
    assembled += buildVoiceSuffix(options.voiceLanguage);
  }

  return assembled;
}

export {
  RESOURCE_LINK_INSTRUCTION,
  ENTITY_CREATION_RULES,
  TOOL_USAGE_MODE,
  CHAT_CITATION_INSTRUCTION,
  APP_SECTION_GUIDE,
  buildVoiceSuffix,
};
