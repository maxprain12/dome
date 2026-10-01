'use strict';

const policy = require('../../shared/many-mode-policy.json');
const PLAN_WRITE_TOOLS = Object.freeze(policy.writeTools);
const PLAN_WRITE_SET = new Set(PLAN_WRITE_TOOLS);
const cmsTools = require('../plugins/cms-tools.cjs');
const { QUESTIONNAIRE_TOOL_DEFINITION, isQuestionnaireTool } = require('./many-plan.cjs');

function parseManyAgentMode(raw) {
  const value = String(raw || '')
    .trim()
    .toLowerCase();
  if (value === 'plan' || value === 'draft' || value === 'agent') return value;
  return 'agent';
}

function toolDefName(def) {
  return def?.function?.name || def?.name || '';
}

function isModeWriteTool(name) {
  return PLAN_WRITE_SET.has(name) || cmsTools.isWriteTool(name);
}

function filterRuntimeToolsForMode(tools, mode, externalNames = []) {
  const external = new Set(externalNames);
  return tools.filter((tool) => mode === 'plan'
    ? !isModeWriteTool(tool.name) && !external.has(tool.name)
    : !isQuestionnaireTool(tool.name));
}

function filterToolDefinitionsForMode(defs, mode) {
  const list = Array.isArray(defs) ? defs.slice() : [];
  if (mode !== 'plan') {
    return list.filter((def) => !isQuestionnaireTool(toolDefName(def)));
  }
  const filtered = list.filter((def) => {
    const name = toolDefName(def);
    return !isModeWriteTool(name);
  });
  if (!filtered.some((def) => isQuestionnaireTool(toolDefName(def)))) {
    filtered.push(QUESTIONNAIRE_TOOL_DEFINITION);
  }
  return filtered;
}

function extraHitlToolNames(mode) {
  if (mode === 'plan') return ['questionnaire'];
  if (mode !== 'draft') return [];
  return [...PLAN_WRITE_TOOLS, ...cmsTools.getWriteToolNames()];
}

function promptOverlayForAgentMode(mode) {
  return policy.prompts[parseManyAgentMode(mode)].join('\n');
}

function applyAgentModeToMessages(messages, mode) {
  const overlay = promptOverlayForAgentMode(mode);
  if (!overlay || !Array.isArray(messages) || messages.length === 0) return messages || [];
  const next = messages.map((row) => ({ ...row }));
  const system = next.find((row) => row && row.role === 'system');
  if (system && typeof system.content === 'string') {
    for (const lines of Object.values(policy.prompts)) {
      system.content = system.content.replaceAll(lines.join('\n'), '').trim();
    }
    system.content = `${system.content}\n\n${overlay}`;
    return next;
  }
  return [{ role: 'system', content: overlay }, ...next];
}

module.exports = {
  parseManyAgentMode,
  filterToolDefinitionsForMode,
  extraHitlToolNames,
  promptOverlayForAgentMode,
  applyAgentModeToMessages,
  isModeWriteTool,
  filterRuntimeToolsForMode,
  PLAN_WRITE_TOOLS,
};
