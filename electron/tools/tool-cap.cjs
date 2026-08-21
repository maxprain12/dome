'use strict';

/** OpenAI Chat Completions API hard limit (also enforced by some OpenRouter models). */
const OPENAI_COMPAT_MAX_TOOLS = 128;

/**
 * Kept first when trimming; order = priority (highest first).
 *
 * Every name here must exist in the catalog — a name that does not match
 * protects nothing while reading as if it did. `pnpm run test:tool-cap` asserts
 * this list against `getAllToolDefinitions()`.
 */
const TOOL_CAP_PRIORITY = [
  'dome_load_doc',
  'get_tool_definition',
  'remember_fact',
  'artifact_update_state',
  'artifact_create',
  'artifact_get',
  'artifact_merge_data',
  'resource_get_active',
  'resource_get_pinned',
  'file_read',
  'file_write',
  'file_edit',
  'web_search',
  'web_fetch',
];

/**
 * Tools a coding run cannot work without. When the run has a workspace these
 * outrank everything else: dropping `github_update_issue` is how an agent ends
 * up reporting "I could not close the issue" while believing it simply chose
 * not to.
 */
const CODING_RUN_PRIORITY = [
  'file_read',
  'file_grep',
  'file_find',
  'file_list',
  'file_tree',
  'file_edit',
  'file_write',
  'shell_exec',
  'git_status',
  'git_diff',
  'git_log',
  'git_add',
  'git_commit',
  'git_branch_create',
  'github_get_issue',
  'github_update_issue',
  'github_list_issues',
  'github_get_pull_request',
  'github_create_pull_request',
  'github_pr_checks',
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
 * Priority order for a run, most important first.
 * Delegation always survives; a coding run then protects its own families.
 * @param {{ coding?: boolean }} [context]
 * @returns {string[]}
 */
function resolveCapPriority(context = {}) {
  const names = ['task'];
  if (context.coding) names.push(...CODING_RUN_PRIORITY);
  names.push(...TOOL_CAP_PRIORITY);
  return [...new Set(names)];
}

/**
 * Trim tools to API limits while preserving the ones this run depends on.
 *
 * @param {unknown[]} tools
 * @param {{ provider?: string, model?: string, max?: number, coding?: boolean }} [opts]
 *   `coding` marks a run with an open workspace.
 * @returns {unknown[]}
 */
function capLangChainTools(tools, opts = {}) {
  const list = Array.isArray(tools) ? tools : [];
  const max = opts.max ?? OPENAI_COMPAT_MAX_TOOLS;
  if (list.length <= max) return list;
  if (!providerNeedsOpenAiToolCap(opts.provider, opts.model)) return list;

  const priority = resolveCapPriority(opts);
  const priorityIndex = new Map(priority.map((n, i) => [n, i]));
  const ranked = list.map((t, originalIndex) => {
    const name = langChainToolName(t);
    const pri = name && priorityIndex.has(name) ? priorityIndex.get(name) : priority.length;
    return { t, pri, originalIndex, name };
  });
  ranked.sort((a, b) => a.pri - b.pri || a.originalIndex - b.originalIndex);
  const capped = ranked.slice(0, max);
  const droppedNames = ranked.slice(max).map((x) => x.name).filter(Boolean);
  console.warn(
    `[Agent] Capped tools ${list.length} → ${capped.length} (provider=${opts.provider || '?'}, model=${opts.model || '?'}, coding=${Boolean(opts.coding)}). ` +
      `Dropped: ${droppedNames.join(', ') || 'unknown'}`,
  );
  return capped.map((x) => x.t);
}

/**
 * Names to expose to the model this turn, keeping the rest registered.
 *
 * This is the `activeToolNames` half of the harness contract (pi's model): the
 * agent keeps the whole catalog — so `get_tool_definition` can describe any of
 * it and `setTools` can widen the set later — while the request carries only
 * what this run plausibly needs. Truncating the registry instead was how the
 * agent ended up unable to call tools it could still read about.
 *
 * @param {unknown[]} tools full registry
 * @param {{ provider?: string, model?: string, max?: number, coding?: boolean }} [opts]
 * @returns {string[] | undefined} undefined = every tool stays active
 */
function resolveActiveToolNames(tools, opts = {}) {
  const list = Array.isArray(tools) ? tools : [];
  const max = opts.max ?? OPENAI_COMPAT_MAX_TOOLS;
  if (list.length <= max) return undefined;
  if (!providerNeedsOpenAiToolCap(opts.provider, opts.model)) return undefined;
  return capLangChainTools(list, opts).map(langChainToolName).filter(Boolean);
}

module.exports = {
  CODING_RUN_PRIORITY,
  resolveActiveToolNames,
  OPENAI_COMPAT_MAX_TOOLS,
  TOOL_CAP_PRIORITY,
  capLangChainTools,
  langChainToolName,
  providerNeedsOpenAiToolCap,
  resolveCapPriority,
};
