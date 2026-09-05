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

const PINNED_SOURCE_TOOL_HINTS: Record<string, string> = {
  social_post: ' → social_post_get',
  email: ' → email_read',
  issue: ' → github_get_issue',
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

type PinnedPerson = NonNullable<VolatileSourceOptions['pinnedPeople']>[number];
type PinnedSource = NonNullable<VolatileSourceOptions['pinnedSources']>[number];
type PinnedResource = NonNullable<VolatileSourceOptions['pinnedResources']>[number];

export const STUB_TOOLS_HINT =
  'The tools[] list is a set of short cards (name + one line). Core tools already include full JSON schemas. For any other tool, call get_tool_definition with its exact name before invoking it.';

const CATALOG_SECTION_KEYS = new Set<keyof CorePromptSections>(['toolCatalog']);

export function buildCoreToolsBlock(
  sections: CorePromptSections,
  mode: 'full' | 'minimal' = 'full',
): string {
  const parts: string[] = [];
  for (const key of CORE_SECTION_KEYS_LIST) {
    if (mode === 'minimal' && CATALOG_SECTION_KEYS.has(key)) continue;
    const text = sections[key];
    if (typeof text === 'string' && text.trim()) parts.push(text.trim());
  }
  if (mode === 'minimal') parts.push(STUB_TOOLS_HINT);
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

function formatPinnedPersonLine(person: PinnedPerson): string {
  const identities = (person.identities || [])
    .map((identity) => `${identity.source}:${identity.displayLabel || identity.externalId}`)
    .join(', ');
  return identities
    ? `- ${person.id}: ${person.title} (${identities})`
    : `- ${person.id}: ${person.title}`;
}

/** Meta string field when present; otherwise null (keeps empty-string semantics). */
function pinnedMetaString(
  meta: PinnedSource['meta'],
  key: string,
): string | null {
  const value = meta?.[key];
  return typeof value === 'string' ? value : null;
}

/** ` key=value` attr for a pinned source of a given kind; empty when missing. */
function pinnedSourceKindAttr(
  src: PinnedSource,
  kind: PinnedSource['kind'],
  key: string,
  attr: string,
): string {
  if (src.kind !== kind) return '';
  const value = pinnedMetaString(src.meta, key);
  return value === null ? '' : ` ${attr}=${value}`;
}

/**
 * Bound-clone working-copy line for issue pins. The run's tools are already
 * scoped to this root, so the model must not guess a path.
 */
function pinnedSourceWorkspace(src: PinnedSource): string {
  if (src.kind !== 'issue') return '';
  const localPath = pinnedMetaString(src.meta, 'localPath')?.trim();
  if (!localPath) return '';
  return `\n  working copy: ${localPath} — the file, shell and git tools are already scoped to it; use relative paths.`;
}

function pinnedSourceBody(src: PinnedSource): string {
  const body = pinnedMetaString(src.meta, 'body')?.trim();
  if (!body) return '';
  return `\n  body: ${body.slice(0, 2000)}`;
}

function formatPinnedSourceLine(src: PinnedSource): string {
  const repo = pinnedSourceKindAttr(src, 'issue', 'fullName', 'repo');
  const folder = pinnedSourceKindAttr(src, 'email', 'folder', 'folder');
  const provider = pinnedSourceKindAttr(src, 'social_post', 'provider', 'provider');
  const status = pinnedSourceKindAttr(src, 'social_post', 'status', 'status');
  const toolHint = PINNED_SOURCE_TOOL_HINTS[src.kind] || '';
  return `- [${src.kind}] ${src.id}: ${src.title}${repo}${folder}${provider}${status}${toolHint}${pinnedSourceWorkspace(src)}${pinnedSourceBody(src)}`;
}

function formatPinnedResourceLine(r: PinnedResource): string {
  return `- ${r.id}: ${r.title} (${r.type})`;
}

function pushVolatileLabel(blocks: string[], header: string, value: string | undefined): void {
  if (typeof value === 'string' && value.trim()) {
    blocks.push(`${header}\n${value.trim()}`);
  }
}

function pushVolatileListBlock<T>(
  blocks: string[],
  header: string,
  items: T[] | undefined,
  lineFn: (item: T) => string,
): void {
  if (items && items.length > 0) {
    const lines = items.map(lineFn).join('\n');
    blocks.push(`${header}\n${lines}`);
  }
}

function formatActiveResourceLine(
  activeResource: VolatileSourceOptions['activeResource'],
): string | null {
  if (!activeResource?.id) return null;
  const type = activeResource.type ? ` / ${activeResource.type}` : '';
  return `**active-resource** — ${activeResource.id}${type}\n"${activeResource.title}". Call resource_get_active() to read content when needed.`;
}

function defaultTaskLine(taskLine: string | undefined): string {
  return (
    taskLine?.trim() ||
    'Respond to the user message using the sources above only when relevant.'
  );
}

export function formatVolatileSourceContext(opts: VolatileSourceOptions = {}): string {
  const blocks: string[] = ['Source (session):'];
  pushVolatileLabel(blocks, '**session-date**', opts.dateLine);
  pushVolatileLabel(blocks, '**ui-context**', opts.uiContext);
  pushVolatileLabel(blocks, '**user-memory**', opts.userMemory);
  pushVolatileListBlock(
    blocks,
    `**mentioned-people** — ${opts.pinnedPeople?.length || 0} person(s). Documents and people are first-class. Use people_get / people_upsert / people_ingest / people_add_interaction to read and persist complete profiles (website, email, occupation, how you met). Resolve identities; do not invent handles.`,
    opts.pinnedPeople,
    formatPinnedPersonLine,
  );
  pushVolatileListBlock(
    blocks,
    `**mentioned-sources** — ${opts.pinnedSources?.length || 0} item(s). Content may be inlined below each id. Use the domain get tool (social_post_get / email_read / github_get_issue) before claiming a pin is missing.`,
    opts.pinnedSources,
    formatPinnedSourceLine,
  );
  pushVolatileListBlock(
    blocks,
    `**pinned-resources** — ${opts.pinnedResources?.length || 0} item(s). Use resource_get_pinned(id); do not search by title.`,
    opts.pinnedResources,
    formatPinnedResourceLine,
  );
  const activeLine = formatActiveResourceLine(opts.activeResource);
  if (activeLine) blocks.push(activeLine);
  blocks.push(`Task: ${defaultTaskLine(opts.taskLine)}`);
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
    const toolsBlock = buildCoreToolsBlock(
      coreSections,
      options.coreToolsMode === 'minimal' ? 'minimal' : 'full',
    );
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
