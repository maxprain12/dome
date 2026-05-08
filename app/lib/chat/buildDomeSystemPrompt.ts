/**
 * Canonical system-prompt assembler for every Dome chat surface.
 *
 * Emits a deterministic string optimized for provider prompt caching (stable prefix first):
 *   1. staticPersona (Many persona, agent instructions, supervisor template…)
 *   2. App section guide (APP_SECTION_GUIDE)
 *   3. Tool limits + catalog summary (prompts/martin/tools.txt)
 *   4. Reference docs stub (dome_load_doc catalog — lazy loaded on demand)
 *   5. Tool usage mode
 *   6. Citation guidance
 *   7. Optional skills catalog markdown (Many — load_skill list)
 *   8. Current date
 *   9. Volatile session context (UI, pinned, memory, active skills)
 *  10. Extra sections (e.g. resource tool hints)
 *  11. Voice suffix (optional)
 */

import { prompts } from '@/lib/prompts/loader';
import {
  TOOL_USAGE_MODE,
  CHAT_CITATION_INSTRUCTION,
  APP_SECTION_GUIDE,
  buildVoiceSuffix,
} from './systemPrompts';

const REFERENCE_DOCS_STUB = `## Reference docs (load only if the user's request needs them)
Available via dome_load_doc(id):
- entity_rules — when creating agents, workflows, automations, or marketplace installs
- artifacts — when emitting any artifact block (inline chat artifacts OR persisted library mini-apps); contains the decision matrix for which kind to use
- artifact_persisted — when creating, updating, or deleting a persisted library mini-app (artifact_create / artifact_update_state / artifact_delete)
- resource_links — only if you are unsure about the dome:// link format`;

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
  /** @deprecated entity_rules are now loaded lazily via dome_load_doc. */
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
  sections.push(prompts.martin.tools);
  sections.push(REFERENCE_DOCS_STUB);

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
  TOOL_USAGE_MODE,
  CHAT_CITATION_INSTRUCTION,
  APP_SECTION_GUIDE,
  buildVoiceSuffix,
};
