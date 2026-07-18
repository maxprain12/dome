"use strict";
const __defProp = Object.defineProperty;
const __getOwnPropDesc = Object.getOwnPropertyDescriptor;
const __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var prompt_assembler_exports = {};
__export(prompt_assembler_exports, {
  CORE_SECTION_KEYS: () => CORE_SECTION_KEYS,
  DOME_LOAD_DOC_DESCRIPTION: () => DOME_LOAD_DOC_DESCRIPTION,
  DOME_LOAD_DOC_IDS: () => DOME_LOAD_DOC_IDS,
  PROMPT_VERSION: () => PROMPT_VERSION,
  applyTemplate: () => applyTemplate,
  buildBenchPrompt: () => buildBenchPrompt,
  buildCoreToolsBlock: () => buildCoreToolsBlock,
  buildDomeSystemPrompt: () => buildDomeSystemPrompt,
  buildEditorPrompt: () => buildEditorPrompt,
  buildStudioPrompt: () => buildStudioPrompt,
  buildSubagentPrompt: () => buildSubagentPrompt,
  buildVoiceSuffix: () => buildVoiceSuffix,
  formatVolatileSourceContext: () => formatVolatileSourceContext,
  todayEnLong: () => todayEnLong
});
module.exports = __toCommonJS(prompt_assembler_exports);
const PROMPT_VERSION = "minimax-v3";
const DOME_LOAD_DOC_IDS = [
  "entity_rules",
  "artifacts",
  "artifact_persisted",
  "artifact_design",
  "feeders",
  "resource_links",
  "ppt_tool",
  "docx_tool",
  "calendar_tool",
  "flashcard_tool",
  "excel_notebook_tool",
  "excel_artifact_tool",
  "email_tool",
  "github_tool",
  "social_tool"
];
const DOME_LOAD_DOC_DESCRIPTION = "Load a reference doc section on demand. Call BEFORE using tools that require it. Valid ids: entity_rules (before agent_create/workflow_create/automation_create/marketplace_install), artifacts (before emitting any artifact block), artifact_persisted (before artifact_create/artifact_update_state/artifact_delete), artifact_design (before artifact_create or artifact_design tool), feeders (before feeder_create/feeder_run), resource_links (if unsure about dome:// link format), ppt_tool (before ppt_create), docx_tool (before docx_create/docx_update), calendar_tool (before calendar_create_event), flashcard_tool (before flashcard_create), excel_notebook_tool (before Excel\u2192notebook pandas flow), excel_artifact_tool (before Excel\u2192artifact dashboard), email_tool (before email_list/email_search/email_send/email_reply), github_tool (before github_create_issue/github_create_milestone/github_update_issue), social_tool (before social_post_draft/social_post_publish).";
const VOICE_LANGUAGE_NAMES = {
  es: "Spanish",
  en: "English",
  de: "German",
  it: "Italian",
  fr: "French",
  pt: "Portuguese"
};
const CORE_SECTION_KEYS_LIST = [
  "constraintsLanguage",
  "appContext",
  "toolGuardrails",
  "toolSurface",
  "toolFormat",
  "toolCatalog",
  "filesystemRules",
  "outputFormat",
  "referenceStub"
];
const CORE_SECTION_KEYS = CORE_SECTION_KEYS_LIST;
function buildCoreToolsBlock(sections) {
  const parts = [];
  for (const key of CORE_SECTION_KEYS_LIST) {
    const text = sections[key];
    if (typeof text === "string" && text.trim())
      parts.push(text.trim());
  }
  return parts.join("\n\n");
}
function todayEnLong() {
  return (/* @__PURE__ */ new Date()).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}
function buildVoiceSuffix(language) {
  const langName = language && VOICE_LANGUAGE_NAMES[language] || VOICE_LANGUAGE_NAMES.es;
  return `

## Voice Response Mode
You are speaking aloud in a live voice conversation. Follow these rules:
- Keep the spoken answer SHORT and conversational (2-4 sentences for simple questions).
- Use natural spoken language \u2014 avoid long markdown, bullet lists, and headers for the part that will be read aloud.
- You MAY still emit \`\`\`artifact:*\`\`\` blocks after the spoken answer when a visual genuinely helps. The TTS layer skips those blocks automatically.
- Summarize instead of enumerating long lists.
- Avoid filler phrases like "of course!", "certainly!".
- Respond in ${langName}.`;
}
function formatVolatileSourceContext(opts = {}) {
  const blocks = [];
  blocks.push("Source (session):");
  if (opts.dateLine?.trim()) {
    blocks.push(`**session-date**
${opts.dateLine.trim()}`);
  }
  if (opts.uiContext?.trim()) {
    blocks.push(`**ui-context**
${opts.uiContext.trim()}`);
  }
  if (opts.userMemory?.trim()) {
    blocks.push(`**user-memory**
${opts.userMemory.trim()}`);
  }
  if (opts.pinnedPeople && opts.pinnedPeople.length > 0) {
    const lines = opts.pinnedPeople.map((person) => {
      const identities = (person.identities || []).map((identity) => `${identity.source}:${identity.displayLabel || identity.externalId}`).join(", ");
      return identities ? `- ${person.id}: ${person.title} (${identities})` : `- ${person.id}: ${person.title}`;
    }).join("\n");
    blocks.push(
      `**mentioned-people** \u2014 ${opts.pinnedPeople.length} person(s). Resolve identities for email/GitHub/social tools; do not invent handles.
${lines}`
    );
  }
  if (opts.pinnedSources && opts.pinnedSources.length > 0) {
    const lines = opts.pinnedSources.map((src) => {
      const repo = src.kind === "issue" && typeof src.meta?.fullName === "string" ? ` repo=${src.meta.fullName}` : "";
      const folder = src.kind === "email" && typeof src.meta?.folder === "string" ? ` folder=${src.meta.folder}` : "";
      const provider = src.kind === "social_post" && typeof src.meta?.provider === "string" ? ` provider=${src.meta.provider}` : "";
      const status = src.kind === "social_post" && typeof src.meta?.status === "string" ? ` status=${src.meta.status}` : "";
      const body = typeof src.meta?.body === "string" && src.meta.body.trim() ? `
  body: ${src.meta.body.trim().slice(0, 2e3)}` : "";
      const toolHint = src.kind === "social_post" ? " \u2192 social_post_get" : src.kind === "email" ? " \u2192 email_read" : src.kind === "issue" ? " \u2192 github_get_issue" : "";
      return `- [${src.kind}] ${src.id}: ${src.title}${repo}${folder}${provider}${status}${toolHint}${body}`;
    }).join("\n");
    blocks.push(
      `**mentioned-sources** \u2014 ${opts.pinnedSources.length} item(s). Content may be inlined below each id. Use the domain get tool (social_post_get / email_read / github_get_issue) before claiming a pin is missing.
${lines}`
    );
  }
  if (opts.pinnedResources && opts.pinnedResources.length > 0) {
    const lines = opts.pinnedResources.map((r) => `- ${r.id}: ${r.title} (${r.type})`).join("\n");
    blocks.push(
      `**pinned-resources** \u2014 ${opts.pinnedResources.length} item(s). Use resource_get_pinned(id); do not search by title.
${lines}`
    );
  }
  if (opts.activeResource?.id) {
    const type = opts.activeResource.type ? ` / ${opts.activeResource.type}` : "";
    blocks.push(
      `**active-resource** \u2014 ${opts.activeResource.id}${type}
"${opts.activeResource.title}". Call resource_get_active() to read content when needed.`
    );
  }
  const task = opts.taskLine?.trim() || "Respond to the user message using the sources above only when relevant.";
  blocks.push(`Task: ${task}`);
  return blocks.join("\n\n");
}
function buildDomeSystemPrompt(options, coreSections) {
  const sections = [];
  const persona = String(options.staticPersona || "").trim();
  if (persona)
    sections.push(persona);
  if (options.coreToolsMode !== "minimal") {
    if (coreSections.constraintsLanguage)
      sections.push(coreSections.constraintsLanguage.trim());
  }
  if (!options.omitCoreTools) {
    if (coreSections.appContext)
      sections.push(coreSections.appContext.trim());
    const toolsBlock = buildCoreToolsBlock(coreSections);
    if (toolsBlock)
      sections.push(toolsBlock);
  } else if (coreSections.toolGuardrails) {
    sections.push(coreSections.toolGuardrails.trim());
  }
  const catalog = options.skillsCatalogMarkdown && String(options.skillsCatalogMarkdown).trim();
  if (catalog)
    sections.push(catalog);
  const volatileParts = [];
  if (options.includeDate !== false) {
    volatileParts.push(`Current date: ${todayEnLong()}.`);
  }
  const volatile = options.volatileContext && String(options.volatileContext).trim();
  if (volatile)
    volatileParts.push(volatile);
  if (volatileParts.length)
    sections.push(volatileParts.join("\n\n"));
  if (Array.isArray(options.extraSections)) {
    for (const extra of options.extraSections) {
      if (typeof extra === "string" && extra.trim())
        sections.push(extra.trim());
    }
  }
  let assembled = sections.join("\n\n");
  if (options.voiceLanguage)
    assembled += buildVoiceSuffix(options.voiceLanguage);
  return assembled;
}
function buildSubagentPrompt(roleBody, taskDescription, sections = {}) {
  const parts = [roleBody.trim()];
  if (sections.toolGuardrails)
    parts.push(sections.toolGuardrails.trim());
  parts.push(`Task: ${taskDescription.trim()}`);
  return parts.join("\n\n");
}
function applyTemplate(template, replacements) {
  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}
function buildEditorPrompt(opts) {
  return applyTemplate(opts.systemTemplate, {
    contextSnippet: opts.contextSnippet,
    actionInstruction: opts.actionInstruction || "Transform the document as requested."
  });
}
function buildStudioPrompt(studioTemplate, taskHint) {
  const parts = [studioTemplate.trim()];
  if (taskHint?.trim())
    parts.push(`Task: ${taskHint.trim()}`);
  return parts.join("\n\n");
}
function buildBenchPrompt(opts) {
  const sections = [opts.intro.trim(), opts.benchRules.trim()];
  if (opts.toolsExcerpt) {
    sections.push(`### Tool reference (subset)
${opts.toolsExcerpt.trim()}`);
  }
  if (opts.fixtureList) {
    sections.push(`Source (fixtures):
${opts.fixtureList.trim()}`);
  }
  if (opts.primaryTool) {
    if (opts.explainOnly) {
      sections.push(
        `Task: Document **${opts.primaryTool}** in prose. Do NOT invoke \`${opts.primaryTool}\`; use get_tool_definition only if needed.`
      );
    } else {
      sections.push(`Task: Execute the user request using \`${opts.primaryTool}\` in the fewest steps.`);
    }
  } else {
    sections.push("Task: Execute the single user request using tools in the fewest steps.");
  }
  sections.push(`Current date: ${todayEnLong()}.`);
  sections.push(`Prompt version: ${PROMPT_VERSION}`);
  return sections.join("\n\n");
}
