'use strict';

/**
 * Deterministic tool selector — replaces the LangChain LLM tool selector by default.
 * No extra model call, no structured-output parse failures, no `{"tools":[...]}` leaks.
 */

const { langChainToolName } = require('./tool-cap.cjs');

const DEFAULT_MAX_TOOLS = 12;

/** Keyword → tool id prefixes/names (Spanish + English). */
const INTENT_RULES = [
  {
    id: 'artifact',
    re: /\b(artifact|artefacto|artefact|reproductor|player|html|mini-?app|__dome_updatestate|persist)\b/i,
    tools: [
      'artifact_list',
      'artifact_get',
      'artifact_create',
      'artifact_update_state',
      'artifact_design',
      'artifact_merge_data',
      'artifact_link_resource',
      'resource_get_active',
    ],
  },
  {
    id: 'local_path',
    re: /(?:\/Users\/|\/home\/|Documents\/|ruta\s+(?:local|en\s+mi)|equipo\s+local|carpeta\s+local|te\s+he\s+dejado|dej[eé]\s+el\s+repo)/i,
    tools: ['file_read', 'file_list', 'file_tree', 'glob'],
  },
  {
    id: 'replace',
    re: /\b(reemplaz|remplaz|sustitu|actualiz|fix|arregl|corrig|play\s*button|bot[oó]n)\b/i,
    tools: ['artifact_update_state', 'artifact_get', 'artifact_list', 'file_read', 'file_tree', 'resource_get'],
  },
  {
    id: 'web',
    re: /\b(busca(?:r)?\s+(?:en\s+)?(?:la\s+)?web|web\s*search|internet|url|http|en\s+l[ií]nea)\b/i,
    tools: ['web_search', 'web_fetch'],
  },
  {
    id: 'resource',
    re: /\b(recurso|biblioteca|library|nota|note|pdf|carpeta|folder|documento)\b/i,
    tools: [
      'resource_hybrid_search',
      'resource_get',
      'resource_list',
      'resource_create',
      'resource_update',
      'resource_get_library_overview',
    ],
  },
  {
    id: 'excel',
    re: /\b(excel|hoja|spreadsheet|celda|xlsx)\b/i,
    tools: ['excel_get', 'excel_set_cell', 'excel_set_range', 'excel_create'],
  },
  {
    id: 'ppt',
    re: /\b(ppt|powerpoint|presentaci[oó]n|diapositiva|slide)\b/i,
    tools: ['ppt_create', 'ppt_get_slides', 'ppt_get_file_path', 'ppt_export'],
  },
  {
    id: 'calendar',
    re: /\b(calendario|calendar|evento|reuni[oó]n|cita)\b/i,
    tools: [
      'calendar_list_events',
      'calendar_get_upcoming',
      'calendar_create_event',
      'calendar_update_event',
    ],
  },
  {
    id: 'browser',
    re: /\b(navegador|browser|p[aá]gina\s+web|screenshot|devtools|click)\b/i,
    tools: ['new_page', 'navigate_page', 'take_snapshot', 'browser_get_active_tab'],
  },
  {
    id: 'delegate',
    re: /\b(investig|research|escrib|writer|datos|data|library|deleg)\b/i,
    tools: ['task'],
  },
];

const DEFAULT_FALLBACK_TOOLS = [
  'dome_load_doc',
  'get_tool_definition',
  'remember_fact',
  'resource_hybrid_search',
  'resource_get',
  'artifact_get',
  'artifact_update_state',
  'file_read',
  'file_tree',
  'task',
];

/**
 * @param {unknown[]} messages
 * @returns {string}
 */
function extractLastUserText(messages) {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (!m || typeof m !== 'object') continue;
    const type =
      typeof m._getType === 'function'
        ? m._getType()
        : m.type || m.role || m.lc_kwargs?.type;
    if (type !== 'human' && type !== 'user') continue;
    const content = m.content ?? m.lc_kwargs?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter((b) => b && (b.type === 'text' || b.type === 'text_delta') && b.text)
        .map((b) => b.text)
        .join(' ');
    }
  }
  return '';
}

/**
 * @param {unknown[]} allTools
 * @param {string[]} preferredNames
 * @param {number} maxTools
 * @returns {unknown[]}
 */
function filterToolsByNames(allTools, preferredNames, maxTools) {
  const list = Array.isArray(allTools) ? allTools : [];
  const wanted = new Set(preferredNames.filter(Boolean));
  const picked = [];
  const seen = new Set();
  for (const name of preferredNames) {
    if (picked.length >= maxTools) break;
    const t = list.find((x) => langChainToolName(x) === name);
    if (t && !seen.has(name)) {
      picked.push(t);
      seen.add(name);
    }
  }
  if (picked.length < maxTools) {
    for (const t of list) {
      if (picked.length >= maxTools) break;
      const n = langChainToolName(t);
      if (!n || seen.has(n)) continue;
      picked.push(t);
      seen.add(n);
    }
  }
  return picked;
}

/**
 * Pick tool names for this model turn from user text heuristics.
 * @param {string} userText
 * @param {Set<string>} available
 * @param {{ alwaysInclude?: string[], maxTools?: number }} [opts]
 * @returns {string[]}
 */
function selectToolNamesForTurn(userText, available, opts = {}) {
  const maxTools = opts.maxTools ?? DEFAULT_MAX_TOOLS;
  const alwaysInclude = opts.alwaysInclude ?? [];
  const chosen = [];
  const seen = new Set();

  const add = (name) => {
    if (!name || seen.has(name) || !available.has(name)) return;
    if (chosen.length >= maxTools) return;
    chosen.push(name);
    seen.add(name);
  };

  for (const n of alwaysInclude) add(n);

  const text = String(userText || '');
  for (const rule of INTENT_RULES) {
    if (!rule.re.test(text)) continue;
    for (const n of rule.tools) add(n);
  }

  for (const n of DEFAULT_FALLBACK_TOOLS) add(n);

  for (const n of available) {
    if (chosen.length >= maxTools) break;
    add(n);
  }

  return chosen.slice(0, maxTools);
}

/**
 * @param {unknown[]} tools
 * @param {{ alwaysInclude?: string[], maxTools?: number }} [opts]
 */
function createDeterministicToolSelectorMiddleware(tools, opts = {}) {
  const allTools = Array.isArray(tools) ? tools : [];
  const available = new Set(allTools.map(langChainToolName).filter(Boolean));
  const alwaysInclude = (opts.alwaysInclude ?? []).filter((n) => available.has(n));
  const maxTools = opts.maxTools ?? DEFAULT_MAX_TOOLS;

  return {
    name: 'DomeDeterministicToolSelector',
    wrapModelCall: async (request, handler) => {
      const userText = extractLastUserText(request?.messages);
      const names = selectToolNamesForTurn(userText, available, { alwaysInclude, maxTools });
      const filtered = filterToolsByNames(allTools, names, maxTools);
      if (process.env.DOME_TOOL_SELECTOR_DEBUG === '1') {
        console.log(
          `[DomeToolSelector] ${allTools.length} → ${filtered.length} tools:`,
          names.join(', '),
        );
      }
      return handler({ ...request, tools: filtered });
    },
  };
}

module.exports = {
  DEFAULT_MAX_TOOLS,
  INTENT_RULES,
  extractLastUserText,
  selectToolNamesForTurn,
  filterToolsByNames,
  createDeterministicToolSelectorMiddleware,
};
