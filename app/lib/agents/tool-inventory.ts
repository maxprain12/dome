/**
 * Canonical tool ids for documentation and coverage checks.
 * Keep in sync with MANY_TOOL_CATALOG and electron/tool-dispatcher TOOL_HANDLER_MAP.
 */
import { MANY_TOOL_CATALOG } from '@/lib/agents/catalog';

/** Tool IDs exposed in Many UI catalog (renderer). */
export const MANY_TOOL_IDS = MANY_TOOL_CATALOG.map((e) => e.id);

/**
 * Additional tools executable in main (LangGraph) that may not appear in MANY_TOOL_CATALOG
 * (e.g. aliases, graph variants, studio).
 */
export const MAIN_PROCESS_EXTRA_TOOL_IDS = [
  'memory_search',
  'memory_get',
  'create_resource_link',
  'generate_knowledge_graph',
  'analyze_graph_structure',
  'remember_fact',
  'load_skill',
  'load_skill_file',
  'get_tool_definition',
  'image_describe',
  'screen_understand',
] as const;

/** Combined list for inventory / docs. */
export const CANONICAL_TOOL_ID_SET = new Set<string>([
  ...MANY_TOOL_IDS,
  ...(MAIN_PROCESS_EXTRA_TOOL_IDS as unknown as string[]),
]);
