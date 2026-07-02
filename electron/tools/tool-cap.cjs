'use strict';

/** OpenAI Chat Completions API hard limit (also enforced by some OpenRouter models). */
const OPENAI_COMPAT_MAX_TOOLS = 128;

/** Kept first when trimming; order = priority (highest first). */
const TOOL_CAP_PRIORITY = [
  'task',
  'dome_load_doc',
  'get_tool_definition',
  'remember_fact',
  'artifact_update_state',
  'artifact_create',
  'artifact_get',
  'artifact_merge_data',
  'resource_get_active',
  'resource_get_pinned',
  'read_file',
  'write_file',
  'edit_file',
  'web_search',
  'web_fetch',
];

/**
 * @param {unknown} t
 * @returns {string | null}
 */
function langChainToolName(t) {
  if (!t || typeof t !== 'object') return null;
  return t.name || t.lc_kwargs?.name || t.function?.name || null;
}

/**
 * Providers/models that use OpenAI's tools[] cap (128).
 * @param {string} [provider]
 * @param {string} [model]
 */
function providerNeedsOpenAiToolCap(provider, model) {
  const p = String(provider || '').toLowerCase();
  const m = String(model || '').toLowerCase();
  if (p === 'openai') return true;
  if (p === 'openrouter' && (m.startsWith('openai/') || m.includes('gpt'))) return true;
  if (p === 'dome') return m.includes('gpt');
  return false;
}

/**
 * Trim LangChain tools to API limits while preserving high-priority names.
 * @param {unknown[]} tools
 * @param {{ provider?: string, model?: string, max?: number }} [opts]
 * @returns {unknown[]}
 */
function capLangChainTools(tools, opts = {}) {
  const list = Array.isArray(tools) ? tools : [];
  const max = opts.max ?? OPENAI_COMPAT_MAX_TOOLS;
  if (list.length <= max) return list;
  if (!providerNeedsOpenAiToolCap(opts.provider, opts.model)) return list;

  const priorityIndex = new Map(TOOL_CAP_PRIORITY.map((n, i) => [n, i]));
  const ranked = list.map((t, originalIndex) => {
    const name = langChainToolName(t);
    const pri = name && priorityIndex.has(name) ? priorityIndex.get(name) : TOOL_CAP_PRIORITY.length;
    return { t, pri, originalIndex };
  });
  ranked.sort((a, b) => a.pri - b.pri || a.originalIndex - b.originalIndex);
  const capped = ranked.slice(0, max).map((x) => x.t);
  const dropped = list.length - capped.length;
  console.warn(
    `[Agent] Capped tools ${list.length} → ${capped.length} (provider=${opts.provider || '?'}, model=${opts.model || '?'}). ` +
      `Dropped ${dropped} tool(s); use get_tool_definition or fewer MCP servers.`,
  );
  return capped;
}

module.exports = {
  OPENAI_COMPAT_MAX_TOOLS,
  TOOL_CAP_PRIORITY,
  providerNeedsOpenAiToolCap,
  capLangChainTools,
  langChainToolName,
};
