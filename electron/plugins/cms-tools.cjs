'use strict';

// The manifest opts in to a small host-owned catalog. Plugins never supply
// executable code or arbitrary tool schemas to the assistant.
const fields = { type: 'object', additionalProperties: { oneOf: [
  { type: 'string' }, { type: 'array', items: { type: 'string' } },
] } };
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const string = { type: 'string' };
const id = { type: 'string', description: 'Identifier returned by a CMS tool' };

const CATALOG = Object.freeze({
  list_entries: {
    method: 'notes.listReadonly', description: 'List CMS entries in the configured vault, including status, language and revision.',
    parameters: object({ limit: { type: 'integer', minimum: 1, maximum: 300 } }),
  },
  get_entry: {
    method: 'notes.get', description: 'Read one CMS entry, including its Markdown body and current revision.',
    parameters: object({ id }, ['id']),
  },
  create_draft: {
    method: 'notes.create', write: true,
    description: 'Create an unpublished CMS draft in its configured collection and language folder. Supply collection, language, date, description and slug in fields.',
    parameters: object({ title: string, body: string, fields, familyId: id }, ['title']),
  },
  update_entry: {
    method: 'notes.update', write: true,
    description: 'Update a CMS entry using the revision returned by get_entry. A conflict is returned when another editor changed it.',
    parameters: object({ id, expectedUpdatedAt: { type: 'integer' }, expectedContentDigest: string, title: string, body: string, fields, familyId: id }, ['id', 'expectedUpdatedAt']),
  },
  sync_entries: {
    method: 'notes.sync', write: true,
    description: 'Synchronize CMS entries with the configured repository.',
    parameters: object({}),
  },
  prepare_publication: {
    method: 'publication.prepare', write: true,
    description: 'Prepare a publication for review without publishing it. Returns a publication request ID.',
    parameters: object({ resourceId: id }, ['resourceId']),
  },
  get_publication: {
    method: 'publication.get',
    description: 'Inspect a prepared CMS publication and its status.',
    parameters: object({ id }, ['id']),
  },
  publish_entry: {
    method: 'publication.requestApproval', write: true, approval: true,
    description: 'Publish a prepared CMS entry to the configured repository. Requires explicit human approval of this tool call.',
    parameters: object({ id }, ['id']),
  },
});

let service = null;
function setPluginService(nextService) { service = nextService; }

function activeTools() {
  if (!service) return [];
  try {
    const plugin = service.listPlugins().find((item) => item.id === 'dome-cms' && item.enabled && item.configured);
    return (plugin?.contributes?.tools || []).filter((tool) => Object.hasOwn(CATALOG, tool));
  } catch {
    return [];
  }
}

function toolName(id) { return `dome_cms_${id}`; }
function toolId(name) {
  if (!String(name).startsWith('dome_cms_')) return null;
  const idValue = String(name).slice('dome_cms_'.length);
  return Object.hasOwn(CATALOG, idValue) ? idValue : null;
}

function getToolDefinitions() {
  return activeTools().map((tool) => ({ type: 'function', function: {
    name: toolName(tool), description: CATALOG[tool].description, parameters: CATALOG[tool].parameters,
  } }));
}

function getWriteToolNames() { return activeTools().filter((tool) => CATALOG[tool].write).map(toolName); }
function isWriteTool(name) { const tool = toolId(name); return Boolean(tool && CATALOG[tool].write); }

async function executeTool(name, args, context) {
  const tool = toolId(name);
  if (!tool) return null;
  if (!activeTools().includes(tool)) return { status: 'error', error: 'CMS tool is not available or the plugin requires configuration' };
  if (CATALOG[tool].approval && context?.hitlApproved !== true) {
    return { status: 'error', error: 'This publication requires explicit in-app approval' };
  }
  try {
    return await service.request('dome-cms', CATALOG[tool].method, args || {});
  } catch (error) {
    return { status: 'error', error: error instanceof Error ? error.message : 'CMS tool failed' };
  }
}

module.exports = { setPluginService, getToolDefinitions, getWriteToolNames, isWriteTool, executeTool, toolId };
