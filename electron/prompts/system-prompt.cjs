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
} = require('../../shared/prompt-assembler/index.cjs');
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
};
