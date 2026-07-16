/**
 * @dome/prompts — assembler (real TypeScript implementation).
 *
 * Phase 4: this is the package-owned port of the legacy
 * `shared/prompt-assembler/index.ts` assembler. Every exported function is a
 * pure function over caller-supplied inputs (the caller loads core sections
 * from disk), so there is no I/O to replicate. Output is byte-identical to
 * the legacy build (see `scripts/test-dome-prompts.mjs`).
 */

import type {
  CorePromptSections,
  DomeSystemPromptOptions,
  VolatileSourceOptions,
  BenchPromptOptions,
} from './types.js';
import { PROMPT_VERSION } from './types.js';

const VOICE_LANGUAGE_NAMES: Record<string, string> = {
  es: 'Spanish',
  en: 'English',
  de: 'German',
  it: 'Italian',
  fr: 'French',
  pt: 'Portuguese',
};

const CORE_SECTION_KEYS_LIST: (keyof CorePromptSections)[] = [
  'constraintsLanguage',
  'appContext',
  'toolGuardrails',
  'toolSurface',
  'toolFormat',
  'toolCatalog',
  'filesystemRules',
  'outputFormat',
  'referenceStub',
];

export const CORE_SECTION_KEYS = CORE_SECTION_KEYS_LIST;

export function buildCoreToolsBlock(sections: CorePromptSections): string {
  const parts: string[] = [];
  for (const key of CORE_SECTION_KEYS_LIST) {
    const text = sections[key];
    if (typeof text === 'string' && text.trim()) parts.push(text.trim());
  }
  return parts.join('\n\n');
}

export function todayEnLong(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function buildVoiceSuffix(language: string | null | undefined): string {
  const langName =
    (language && VOICE_LANGUAGE_NAMES[language]) || VOICE_LANGUAGE_NAMES.es;
  return `

## Voice Response Mode
You are speaking aloud in a live voice conversation. Follow these rules:
- Keep the spoken answer SHORT and conversational (2-4 sentences for simple questions).
- Use natural spoken language — avoid long markdown, bullet lists, and headers for the part that will be read aloud.
- You MAY still emit \`\`\`artifact:*\`\`\` blocks after the spoken answer when a visual genuinely helps. The TTS layer skips those blocks automatically.
- Summarize instead of enumerating long lists.
- Avoid filler phrases like "of course!", "certainly!".
- Respond in ${langName}.`;
}

export function formatVolatileSourceContext(opts: VolatileSourceOptions = {}): string {
  const blocks: string[] = [];
  blocks.push('Source (session):');

  if (opts.dateLine?.trim()) {
    blocks.push(`**session-date**\n${opts.dateLine.trim()}`);
  }

  if (opts.uiContext?.trim()) {
    blocks.push(`**ui-context**\n${opts.uiContext.trim()}`);
  }

  if (opts.userMemory?.trim()) {
    blocks.push(`**user-memory**\n${opts.userMemory.trim()}`);
  }

  if (opts.pinnedPeople && opts.pinnedPeople.length > 0) {
    const lines = opts.pinnedPeople
      .map((person) => {
        const identities = (person.identities || [])
          .map((identity) => `${identity.source}:${identity.displayLabel || identity.externalId}`)
          .join(', ');
        return identities
          ? `- ${person.id}: ${person.title} (${identities})`
          : `- ${person.id}: ${person.title}`;
      })
      .join('\n');
    blocks.push(
      `**mentioned-people** — ${opts.pinnedPeople.length} person(s). Resolve identities for email/GitHub/social tools; do not invent handles.\n${lines}`,
    );
  }

  if (opts.pinnedSources && opts.pinnedSources.length > 0) {
    const lines = opts.pinnedSources
      .map((src) => {
        const repo =
          src.kind === 'issue' && typeof src.meta?.fullName === 'string'
            ? ` repo=${src.meta.fullName}`
            : '';
        const folder =
          src.kind === 'email' && typeof src.meta?.folder === 'string'
            ? ` folder=${src.meta.folder}`
            : '';
        return `- [${src.kind}] ${src.id}: ${src.title}${repo}${folder}`;
      })
      .join('\n');
    blocks.push(
      `**mentioned-sources** — ${opts.pinnedSources.length} item(s). Prefer domain tools (GitHub issues / email / social) with these ids; do not invent ids.\n${lines}`,
    );
  }

  if (opts.pinnedResources && opts.pinnedResources.length > 0) {
    const lines = opts.pinnedResources
      .map((r) => `- ${r.id}: ${r.title} (${r.type})`)
      .join('\n');
    blocks.push(
      `**pinned-resources** — ${opts.pinnedResources.length} item(s). Use resource_get_pinned(id); do not search by title.\n${lines}`,
    );
  }

  if (opts.activeResource?.id) {
    const type = opts.activeResource.type ? ` / ${opts.activeResource.type}` : '';
    blocks.push(
      `**active-resource** — ${opts.activeResource.id}${type}\n"${opts.activeResource.title}". Call resource_get_active() to read content when needed.`,
    );
  }

  const task =
    opts.taskLine?.trim() ||
    'Respond to the user message using the sources above only when relevant.';
  blocks.push(`Task: ${task}`);

  return blocks.join('\n\n');
}

export function buildDomeSystemPrompt(
  options: DomeSystemPromptOptions,
  coreSections: CorePromptSections,
): string {
  const sections: string[] = [];
  const persona = String(options.staticPersona || '').trim();
  if (persona) sections.push(persona);

  if (options.coreToolsMode !== 'minimal') {
    if (coreSections.constraintsLanguage) sections.push(coreSections.constraintsLanguage.trim());
  }

  if (!options.omitCoreTools) {
    if (coreSections.appContext) sections.push(coreSections.appContext.trim());
    const toolsBlock = buildCoreToolsBlock(coreSections);
    if (toolsBlock) sections.push(toolsBlock);
  } else if (coreSections.toolGuardrails) {
    sections.push(coreSections.toolGuardrails.trim());
  }

  const catalog = options.skillsCatalogMarkdown && String(options.skillsCatalogMarkdown).trim();
  if (catalog) sections.push(catalog);

  const volatileParts: string[] = [];
  if (options.includeDate !== false) {
    volatileParts.push(`Current date: ${todayEnLong()}.`);
  }
  const volatile = options.volatileContext && String(options.volatileContext).trim();
  if (volatile) volatileParts.push(volatile);
  if (volatileParts.length) sections.push(volatileParts.join('\n\n'));

  if (Array.isArray(options.extraSections)) {
    for (const extra of options.extraSections) {
      if (typeof extra === 'string' && extra.trim()) sections.push(extra.trim());
    }
  }

  let assembled = sections.join('\n\n');
  if (options.voiceLanguage) assembled += buildVoiceSuffix(options.voiceLanguage);
  return assembled;
}

export function buildSubagentPrompt(
  roleBody: string,
  taskDescription: string,
  sections: Partial<CorePromptSections> = {},
): string {
  const parts = [roleBody.trim()];
  if (sections.toolGuardrails) parts.push(sections.toolGuardrails.trim());
  parts.push(`Task: ${taskDescription.trim()}`);
  return parts.join('\n\n');
}

export function applyTemplate(template: string, replacements: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

export function buildEditorPrompt(opts: {
  systemTemplate: string;
  contextSnippet: string;
  actionInstruction?: string;
}): string {
  return applyTemplate(opts.systemTemplate, {
    contextSnippet: opts.contextSnippet,
    actionInstruction: opts.actionInstruction || 'Transform the document as requested.',
  });
}

export function buildStudioPrompt(studioTemplate: string, taskHint?: string): string {
  const parts = [studioTemplate.trim()];
  if (taskHint?.trim()) parts.push(`Task: ${taskHint.trim()}`);
  return parts.join('\n\n');
}

export function buildBenchPrompt(opts: BenchPromptOptions): string {
  const sections = [opts.intro.trim(), opts.benchRules.trim()];
  if (opts.toolsExcerpt) {
    sections.push(`### Tool reference (subset)\n${opts.toolsExcerpt.trim()}`);
  }
  if (opts.fixtureList) {
    sections.push(`Source (fixtures):\n${opts.fixtureList.trim()}`);
  }
  if (opts.primaryTool) {
    if (opts.explainOnly) {
      sections.push(
        `Task: Document **${opts.primaryTool}** in prose. Do NOT invoke \`${opts.primaryTool}\`; use get_tool_definition only if needed.`,
      );
    } else {
      sections.push(`Task: Execute the user request using \`${opts.primaryTool}\` in the fewest steps.`);
    }
  } else {
    sections.push('Task: Execute the single user request using tools in the fewest steps.');
  }
  sections.push(`Current date: ${todayEnLong()}.`);
  sections.push(`Prompt version: ${PROMPT_VERSION}`);
  return sections.join('\n\n');
}
