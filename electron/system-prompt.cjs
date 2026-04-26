/**
 * Unified Dome system-prompt assembler (main process).
 *
 * Mirrors the renderer-side `buildDomeSystemPrompt` in
 * `app/lib/chat/buildDomeSystemPrompt.ts` so every chat surface
 * (Many, Agent Chat, Agent Team, WhatsApp, run-engine workers)
 * receives the same artifact / tool / entity / citation rules.
 */

const { readPrompt } = require('./prompts-loader.cjs');

const RESOURCE_LINK_INSTRUCTION = `## Resource & Navigation Links
When mentioning a resource (note, PDF, video, etc.) that the user can open, ALWAYS use: [Ver: Title](dome://resource/RESOURCE_ID/TYPE). Use the exact resource ID and type returned by tools. Types: note, pdf, url, youtube, notebook, docx, excel, ppt, video, audio, image, folder.

NEVER use resource:// or file:// or raw http(s):// for internal resources — only dome://resource/ID/TYPE works. Using https:// opens in the browser instead of Dome. NEVER use [[Title]] wikilinks or /resource/ID paths.

When listing resources, show ONLY the title (e.g. "CE_Python.pdf"), never folder paths.

For folders / subfolders (e.g. from get_library_overview) use: [Abrir carpeta: Title](dome://folder/FOLDER_ID).

For PDFs, when a specific page is relevant, use: [Ver: Title p. N](dome://resource/RESOURCE_ID/pdf?page=N).

For Studio outputs (mindmap, quiz, guide, FAQ, timeline, table, flashcards, audio, video, research), use: [Ver: Title](dome://studio/OUTPUT_ID/TYPE).

ALWAYS include a dome:// link whenever you create an element via tools (resource_create, flashcard_create, etc.) so the user can open it.`;

const ENTITY_CREATION_RULES = `## Entity Creation (agent_create, workflow_create, automation_create)
- **agent_create**: Always pass \`tool_ids\` — an agent without tools cannot work. After calling, your response MUST include the artifact block:
  \`\`\`artifact:created_entity
  {JSON from tool result, stripping any ENTITY_CREATED: prefix}
  \`\`\`
  Without it, the user only sees plain text instead of the entity card.
- **workflow_create**: When workflow nodes reference custom agents, create those agents first with agent_create (including tool_ids!) and reference their IDs in nodes.
- **automation_create**: Dome has native automations. After creating an agent that could run recurrently, offer to create an automation. Never mention n8n or Make.`;

const TOOL_USAGE_MODE = `## Tool Usage Mode
- You are running in a single direct-tools runtime.
- Decide yourself whether to answer directly or call tools.
- If the current context already contains enough information, answer directly without tools.
- Use tools only when you need fresh workspace data, external information, or to perform an action.
- Never delegate or hand off the response to subagents.`;

const CHAT_CITATION_INSTRUCTION = `## Citation Guidance
- When you use evidence from resource_semantic_search or resource_get, cite the supporting source inline as [1], [2], etc.
- Reuse the numbering order from the most recent tool results in this answer.
- Prefer one citation per concrete factual claim or paragraph grounded in the library.`;

const VOICE_LANGUAGE_NAMES = {
  es: 'Spanish',
  en: 'English',
  de: 'German',
  it: 'Italian',
  fr: 'French',
  pt: 'Portuguese',
};

function buildVoiceSuffix(language) {
  const langName = (language && VOICE_LANGUAGE_NAMES[language]) || VOICE_LANGUAGE_NAMES.es;
  return `\n\n## Voice Response Mode
You are speaking aloud in a live voice conversation. Follow these rules:
- Keep the spoken answer SHORT and conversational (2-4 sentences for simple questions).
- Use natural spoken language — avoid long markdown, bullet lists, and headers for the part that will be read aloud.
- You MAY still emit \`\`\`artifact:*\`\`\` blocks after the spoken answer when a visual (calculator, diagram, dashboard, table, timeline, entity card...) genuinely helps the user. The TTS layer skips those blocks automatically; do not read them aloud.
- Summarize instead of enumerating long lists.
- Avoid filler phrases like "of course!", "certainly!".
- Respond in ${langName}.`;
}

function todayEnLong() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * @typedef {Object} DomeSystemPromptOptions
 * @property {string} baseInstructions
 * @property {boolean} [includeDate]
 * @property {Array<string|null|undefined>} [extraSections]
 * @property {string|null} [pinnedResourcesMarkdown]
 * @property {string|null} [activeSkillMarkdown]
 * @property {string|null} [voiceLanguage]
 * @property {boolean} [omitCitationGuidance]
 * @property {boolean} [omitToolUsageMode]
 * @property {boolean} [omitEntityRules]
 */

/**
 * Builds the canonical Dome system prompt used by every chat surface.
 * @param {DomeSystemPromptOptions} options
 * @returns {string}
 */
function buildDomeSystemPrompt(options) {
  const sections = [];

  const base = String(options.baseInstructions || '').trim();
  if (base) sections.push(base);

  sections.push(RESOURCE_LINK_INSTRUCTION);

  const artifactsTxt = readPrompt('martin/artifacts.txt');
  if (artifactsTxt) sections.push(artifactsTxt.trim());

  const toolsTxt = readPrompt('martin/tools.txt');
  if (toolsTxt) sections.push(toolsTxt.trim());

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

  if (options.pinnedResourcesMarkdown && String(options.pinnedResourcesMarkdown).trim()) {
    sections.push(String(options.pinnedResourcesMarkdown).trim());
  }

  if (options.activeSkillMarkdown && String(options.activeSkillMarkdown).trim()) {
    sections.push(String(options.activeSkillMarkdown).trim());
  }

  let assembled = sections.join('\n\n');

  if (options.voiceLanguage) {
    assembled += buildVoiceSuffix(options.voiceLanguage);
  }

  return assembled;
}

module.exports = {
  buildDomeSystemPrompt,
  buildVoiceSuffix,
  RESOURCE_LINK_INSTRUCTION,
  ENTITY_CREATION_RULES,
  TOOL_USAGE_MODE,
  CHAT_CITATION_INSTRUCTION,
};
