'use strict';

const { CODING_RUN_PRIORITY } = require('./tool-cap.cjs');

const STUB_LOOKUP_HINT = 'Call get_tool_definition before using.';
const STUB_DESC_MAX = 120;
const EMPTY_PARAMETERS = Object.freeze({ type: 'object', properties: {}, additionalProperties: true });

/**
 * Tools that keep a full JSON schema on every turn (happy path, no lookup).
 * Everything else is a one-line card until `get_tool_definition` expands it.
 */
const CORE_FULL_SCHEMA_TOOLS = [
  'get_tool_definition',
  'dome_load_doc',
  'skill_read',
  'remember_fact',
  'resource_search',
  'resource_get',
  'resource_get_active',
  'web_search',
  'web_fetch',
  'task',
  'delegate_to_agent',
];

/**
 * @param {unknown} text
 * @param {number} [max]
 * @returns {string}
 */
function firstLineDescription(text, max = STUB_DESC_MAX) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const cut = raw.search(/[.!?]/);
  const line = cut >= 0 ? raw.slice(0, cut + 1) : raw;
  if (line.length <= max) return line;
  return `${line.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/**
 * @param {unknown} description
 * @returns {string}
 */
function stubDescription(description) {
  const one = firstLineDescription(description);
  if (!one) return STUB_LOOKUP_HINT;
  if (one.includes('get_tool_definition')) return one;
  return `${one} ${STUB_LOOKUP_HINT}`.trim();
}

/**
 * OpenAI-style function definition → one-line card (no parameter schema).
 * @param {{ name?: string, description?: string, function?: { name?: string, description?: string } }} def
 */
function toStubToolDefinition(def) {
  const name = def?.function?.name || def?.name || '';
  const raw = def?.function?.description || def?.description || name;
  return {
    type: 'function',
    function: {
      name,
      description: stubDescription(raw),
      parameters: { type: 'object', properties: {} },
    },
  };
}

/**
 * @param {{ name?: string, description?: string, parameters?: unknown, execute?: Function }} tool
 */
function toStubAgentTool(tool) {
  const name = tool?.name || '';
  return {
    ...tool,
    description: stubDescription(tool?.description),
    parameters: { ...EMPTY_PARAMETERS },
    execute: async () => ({
      content: [{
        type: 'text',
        text:
          `Tool "${name}" is a short card. Call get_tool_definition with tool_name="${name}" ` +
          'to load its schema, then invoke it.',
      }],
    }),
  };
}

/**
 * @param {unknown} parameters
 * @returns {boolean}
 */
function isStubParameters(parameters) {
  if (!parameters || typeof parameters !== 'object') return false;
  const props = /** @type {{ properties?: unknown }} */ (parameters).properties;
  if (props == null) return true;
  if (typeof props !== 'object') return false;
  return Object.keys(props).length === 0;
}

/**
 * @param {{ coding?: boolean, expandedNames?: string[] }} [opts]
 * @returns {Set<string>}
 */
function resolveFullSchemaNames(opts = {}) {
  const names = new Set(CORE_FULL_SCHEMA_TOOLS);
  if (opts.coding) {
    for (const name of CODING_RUN_PRIORITY) names.add(name);
  }
  for (const name of opts.expandedNames || []) {
    if (name) names.add(name);
  }
  return names;
}

/**
 * Keep the full registry for execution / lookup; offer stubs to the model.
 *
 * @param {Array<{ name?: string }>} tools
 * @param {{ coding?: boolean, expandedNames?: string[] }} [opts]
 * @returns {{ offered: object[], fullByName: Map<string, object> }}
 */
function applyToolStubs(tools, opts = {}) {
  const fullNames = resolveFullSchemaNames(opts);
  /** @type {Map<string, object>} */
  const fullByName = new Map();
  const offered = [];
  for (const tool of Array.isArray(tools) ? tools : []) {
    if (!tool || typeof tool !== 'object' || !tool.name) continue;
    fullByName.set(tool.name, tool);
    offered.push(fullNames.has(tool.name) ? tool : toStubAgentTool(tool));
  }
  return { offered, fullByName };
}

module.exports = {
  CORE_FULL_SCHEMA_TOOLS,
  STUB_LOOKUP_HINT,
  STUB_DESC_MAX,
  firstLineDescription,
  stubDescription,
  toStubToolDefinition,
  toStubAgentTool,
  isStubParameters,
  resolveFullSchemaNames,
  applyToolStubs,
};
