/* eslint-disable no-console */
const { getAllToolDefinitions, getToolDefinitionsByIds } = require('../tool-dispatcher.cjs');

/** Tools that may run before the primary tool without failing structural checks. */
const PREAMBLE_TOOLS = new Set(['dome_load_doc', 'get_tool_definition']);

/** Optional helpers per primary tool (still scoped, no filesystem). */
const HELPER_TOOLS = {
  resource_get: ['resource_search', 'resource_hybrid_search', 'resource_semantic_search'],
  resource_get_section: ['resource_hybrid_search', 'resource_semantic_search', 'resource_get'],
  resource_get_pinned: ['resource_get'],
  resource_hybrid_search: ['resource_get'],
  resource_semantic_search: ['resource_get'],
  resource_get_active: ['resource_get'],
  generate_mindmap: ['resource_get'],
  generate_quiz: ['resource_get'],
  generate_guide: ['resource_get'],
  generate_faq: ['resource_get'],
  generate_timeline: ['resource_get'],
  generate_table: ['resource_get'],
  flashcard_create: ['resource_get'],
  excel_get: ['excel_get_file_path'],
  excel_set_cell: ['excel_get', 'excel_get_file_path'],
  excel_set_range: ['excel_get', 'excel_get_file_path'],
  excel_add_row: ['excel_get', 'excel_get_file_path'],
  excel_add_sheet: ['excel_get', 'excel_get_file_path'],
  excel_export: ['excel_get', 'excel_get_file_path'],
  docx_get: ['docx_get_file_path'],
  docx_update: ['docx_get', 'docx_get_file_path'],
  ppt_get_slides: ['ppt_get_file_path'],
  ppt_get_slide_images: ['ppt_get_file_path', 'ppt_get_slides'],
  ppt_export: ['ppt_get_file_path'],
  pdf_render_page: ['resource_get'],
  artifact_get: ['artifact_list'],
  artifact_update_state: ['artifact_list', 'artifact_get'],
  artifact_link_resource: ['artifact_list', 'artifact_get', 'resource_search'],
  artifact_merge_data: ['artifact_get'],
  feeder_run: ['feeder_list'],
  feeder_history: ['feeder_list'],
  feeder_update_script: ['feeder_list'],
  feeder_delete: ['feeder_list'],
  calendar_update_event: ['calendar_list_events', 'calendar_get_upcoming'],
  calendar_delete_event: ['calendar_list_events'],
  agent_create: ['dome_load_doc'],
  automation_create: ['dome_load_doc', 'agent_create'],
  workflow_create: ['dome_load_doc'],
  marketplace_install: ['marketplace_search'],
  link_resources: ['resource_get'],
  get_related_resources: ['resource_get'],
};

/**
 * Return a reduced tool definition list so the model cannot wander into file_tree/shell_exec.
 */
const EXPLAIN_ONLY_META_TOOLS = ['get_tool_definition', 'dome_load_doc'];

function getToolDefinitionsForCase(caseDef) {
  if (caseDef.mode === 'supervisor') return [];

  /** Explain-only cases: do not expose the target tool (avoids self-invocation + forbidden mismatch). */
  if (caseDef.explain_only) {
    return getToolDefinitionsByIds(EXPLAIN_ONLY_META_TOOLS);
  }

  const primary = caseDef.tool;
  if (!primary) return getAllToolDefinitions();

  const allowed = new Set([primary, ...(caseDef.helper_tools || HELPER_TOOLS[primary] || [])]);
  if (caseDef.allow_preamble) {
    for (const t of PREAMBLE_TOOLS) allowed.add(t);
  }

  if (caseDef.forbidden_tools?.length) {
    for (const f of caseDef.forbidden_tools) allowed.delete(f);
  }

  const filtered = getAllToolDefinitions().filter((def) => {
    const name = def?.function?.name;
    return name && allowed.has(name);
  });
  if (filtered.length > 0) return filtered;
  return getToolDefinitionsByIds([...allowed]);
}

module.exports = { PREAMBLE_TOOLS, HELPER_TOOLS, getToolDefinitionsForCase };
