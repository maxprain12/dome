/**
 * Human-readable tool labels (short names for TUI / agent tool registry).
 * Keep in sync with `app/lib/chat` i18n keys where possible.
 */
export const TOOL_LABELS: Readonly<Record<string, string>> = {
  // Web
  web_search: 'Web Search',
  web_fetch: 'Web Fetch',
  deep_research: 'Deep Research',
  // File
  file_read: 'Read File',
  file_write: 'Write File',
  file_list: 'List Directory',
  file_tree: 'File Tree',
  file_search: 'Search Files',
  // Shell
  shell_exec: 'Shell',
  // Delegation
  task: 'Subagent',
  delegate_to_agent: 'Delegate',
  write_todos: 'Plan',
  // Docs / meta
  dome_load_doc: 'Load Doc',
  get_tool_definition: 'Get Tool Definition',
  skill_read: 'Read Skill',
  // Artifacts
  artifact_create: 'Artifact Create',
  artifact_design: 'Artifact Design',
  artifact_get: 'Artifact Get',
  artifact_update_state: 'Artifact Update',
  artifact_merge_data: 'Artifact Merge',
};

export function labelForTool(name: string): string {
  const key = (name || '').trim();
  if (!key) return 'Tool';
  return TOOL_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
