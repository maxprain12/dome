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

module.exports = { measurePrompt };
