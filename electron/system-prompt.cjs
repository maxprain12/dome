/**
 * Unified Dome system-prompt assembler (main process).
 * Delegates to shared/prompt-assembler — same logic as renderer buildDomeSystemPrompt.ts.
 */

const {
  buildDomeSystemPrompt: buildShared,
  buildVoiceSuffix,
  formatVolatileSourceContext,
  buildSubagentPrompt,
  buildEditorPrompt,
  buildStudioPrompt,
  buildBenchPrompt,
  PROMPT_VERSION,
  DOME_LOAD_DOC_IDS,
  DOME_LOAD_DOC_DESCRIPTION,
} = require('../shared/prompt-assembler/index.cjs');
const { loadCorePromptSections, readCoreFile } = require('./core-prompt-loader.cjs');

function getCoreSectionsForAssembler() {
  const s = loadCorePromptSections();
  return {
    roleMany: s.roleMany,
    constraintsLanguage: s.constraintsLanguage,
    appContext: s.appContext,
    toolGuardrails: s.toolGuardrails,
    toolSurface: s.toolSurface,
    toolFormat: s.toolFormat,
    toolCatalog: s.toolCatalog,
    filesystemRules: s.filesystemRules,
    asyncSubagents: s.asyncSubagents,
    outputFormat: s.outputFormat,
    referenceStub: s.referenceStub,
  };
}

function buildDomeSystemPrompt(options) {
  return buildShared(options, getCoreSectionsForAssembler());
}

function buildManyRolePrompt() {
  return readCoreFile('roleMany')?.trim() || '';
}

/** @deprecated Use readCoreFile('entityRules') or dome_load_doc */
const ENTITY_CREATION_RULES = readCoreFile('entityRules') || '';

/** @deprecated Use readCoreFile('resourceLinks') or dome_load_doc */
const RESOURCE_LINK_INSTRUCTION = readCoreFile('resourceLinks') || '';

/** @deprecated Sections moved to prompts/martin/core/app-context.txt */
const APP_SECTION_GUIDE = readCoreFile('appContext')?.replace(/^Context:\n/, '') || '';

/** @deprecated Moved to core/tool-surface.txt */
const TOOL_USAGE_MODE = '';

/** @deprecated Moved to core/output-format.txt */
const CHAT_CITATION_INSTRUCTION = '';

module.exports = {
  buildDomeSystemPrompt,
  buildManyRolePrompt,
  buildVoiceSuffix,
  formatVolatileSourceContext,
  buildSubagentPrompt,
  buildEditorPrompt,
  buildStudioPrompt,
  buildBenchPrompt,
  PROMPT_VERSION,
  DOME_LOAD_DOC_IDS,
  DOME_LOAD_DOC_DESCRIPTION,
  loadCorePromptSections,
  readCoreFile,
  getCoreSectionsForAssembler,
  // Legacy exports for prompt-sections.cjs and external callers
  ENTITY_CREATION_RULES,
  RESOURCE_LINK_INSTRUCTION,
  APP_SECTION_GUIDE,
  TOOL_USAGE_MODE,
  CHAT_CITATION_INSTRUCTION,
};
