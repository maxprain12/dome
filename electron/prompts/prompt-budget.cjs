/* eslint-disable no-console */
'use strict';

function approxTokens(charCount) {
  if (!Number.isFinite(charCount) || charCount <= 0) return 0;
  return Math.max(1, Math.ceil(charCount / 4));
}

function toolPayloadSize(tool) {
  if (tool == null) return 0;
  try {
    return JSON.stringify(tool).length;
  } catch {
    return String(tool).length;
  }
}

function sumToolTokens(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return 0;
  let chars = 0;
  for (const t of tools) chars += toolPayloadSize(t);
  return approxTokens(chars);
}

function messageContentChars(msg) {
  if (!msg || typeof msg !== 'object') return 0;
  const c = msg.content;
  if (typeof c === 'string') return c.length;
  if (Array.isArray(c)) {
    let sum = 0;
    for (const part of c) {
      if (part && typeof part === 'object' && typeof part.text === 'string') sum += part.text.length;
    }
    return sum;
  }
  if (c != null && typeof c === 'object') {
    try {
      return JSON.stringify(c).length;
    } catch {
      return 0;
    }
  }
  return 0;
}

/**
 * Coarse tokenizer (chars÷4) for telemetry before streaming to the LLM.
 * @param {{ system?: unknown, tools?: unknown[], history?: unknown[] }} params
 */
function measurePrompt(params) {
  const system = typeof params?.system === 'string' ? params.system : '';
  const tools = Array.isArray(params?.tools) ? params.tools : [];
  const history = Array.isArray(params?.history) ? params.history : [];

  const systemChars = system.length;
  let toolsChars = 0;
  for (const t of tools) {
    toolsChars += toolPayloadSize(t);
  }
  let historyChars = 0;
  for (const m of history) {
    historyChars += messageContentChars(m);
  }

  const totalChars = systemChars + toolsChars + historyChars;

  return {
    systemApprox: approxTokens(systemChars),
    toolsApprox: approxTokens(toolsChars),
    historyApprox: approxTokens(historyChars),
    totalApprox: approxTokens(totalChars),
    toolCount: tools.length,
    historyTurns: history.length,
  };
}

/**
 * Segmented breakdown for the context usage popup.
 * @param {{
 *   baseSystem?: string,
 *   skillsBlock?: string,
 *   rulesBlock?: string,
 *   domeTools?: unknown[],
 *   mcpTools?: unknown[],
 *   subagentTools?: unknown[],
 *   history?: unknown[],
 *   summarizedChars?: number,
 * }} params
 */
function measurePromptDetailed(params) {
  const baseSystem = typeof params?.baseSystem === 'string' ? params.baseSystem : '';
  const skillsBlock = typeof params?.skillsBlock === 'string' ? params.skillsBlock : '';
  const rulesBlock = typeof params?.rulesBlock === 'string' ? params.rulesBlock : '';
  const domeTools = Array.isArray(params?.domeTools) ? params.domeTools : [];
  const mcpTools = Array.isArray(params?.mcpTools) ? params.mcpTools : [];
  const subagentTools = Array.isArray(params?.subagentTools) ? params.subagentTools : [];
  const history = Array.isArray(params?.history) ? params.history : [];
  const summarizedChars = Number(params?.summarizedChars) || 0;

  const systemPromptApprox = approxTokens(baseSystem.length);
  const skillsApprox = approxTokens(skillsBlock.length);
  const rulesApprox = approxTokens(rulesBlock.length);
  const toolsRegistryApprox = sumToolTokens(domeTools);
  const mcpApprox = sumToolTokens(mcpTools);
  const subagentsApprox = sumToolTokens(subagentTools);
  const summarizedApprox = approxTokens(summarizedChars);

  let historyChars = 0;
  for (const m of history) historyChars += messageContentChars(m);
  const historyApprox = approxTokens(historyChars);
  const conversationApprox = Math.max(0, historyApprox - summarizedApprox);

  const systemApprox = systemPromptApprox + skillsApprox + rulesApprox;
  const toolsApprox = toolsRegistryApprox + mcpApprox + subagentsApprox;
  const totalApprox = systemApprox + toolsApprox + historyApprox;

  return {
    systemApprox,
    toolsApprox,
    historyApprox,
    totalApprox,
    toolCount: domeTools.length + mcpTools.length + subagentTools.length,
    historyTurns: history.length,
    systemPromptApprox,
    skillsApprox,
    rulesApprox,
    toolsRegistryApprox,
    mcpApprox,
    subagentsApprox,
    summarizedApprox,
    conversationApprox,
  };
}

module.exports = { measurePrompt, measurePromptDetailed };
