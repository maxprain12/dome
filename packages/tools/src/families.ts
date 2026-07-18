/**
 * @dome/tools — tool → family taxonomy.
 *
 * The authoritative list of tool names is
 * `electron/tool-dispatcher.cjs#getAllToolDefinitions()` (123 tools, kept in
 * sync with `ai-tools-handler.cjs#TOOL_HANDLER_MAP` by
 * `scripts/verify-tool-coverage.mjs`). This map groups them by responsibility
 * so each family can be migrated into its own module incrementally
 * (see `longrunning-task/mapping/tool-map.md`).
 *
 * Keep this in sync as tools are added: a name not present here resolves to
 * the `'misc'` family via `familyOf()`.
 */

export type ToolFamily =
  | 'web'
  | 'resources'
  | 'projects'
  | 'memory'
  | 'people'
  | 'calendar'
  | 'email'
  | 'github'
  | 'social'
  | 'artifacts'
  | 'feeders'
  | 'flashcards'
  | 'notebook'
  | 'office'
  | 'vision'
  | 'docs'
  | 'entities'
  | 'marketplace'
  | 'browser'
  | 'image'
  | 'file'
  | 'shell'
  | 'studio'
  | 'ui'
  | 'pipelines'
  | 'misc';

/** Tool name → family. Source: getAllToolDefinitions() (123 tools). */
export const TOOL_FAMILIES: Readonly<Record<string, ToolFamily>> = {
  // web
  web_search: 'web', web_fetch: 'web', deep_research: 'web',
  // resources
  resource_search: 'resources', resource_get: 'resources', resource_list: 'resources',
  resource_hybrid_search: 'resources', resource_semantic_search: 'resources',
  resource_get_section: 'resources', get_document_structure: 'resources',
  link_resources: 'resources', get_related_resources: 'resources', pdf_render_page: 'resources',
  get_recent_resources: 'resources', get_library_overview: 'resources',
  resource_get_library_overview: 'resources', resource_get_active: 'resources',
  resource_get_pinned: 'resources', resource_create: 'resources', resource_update: 'resources',
  resource_delete: 'resources', resource_move_to_folder: 'resources',
  // projects
  project_list: 'projects', project_get: 'projects', get_current_project: 'projects',
  // memory / interactions
  interaction_list: 'memory', remember_fact: 'memory',
  // people
  people_get: 'people',
  // calendar
  calendar_list_events: 'calendar', calendar_get_upcoming: 'calendar',
  calendar_create_event: 'calendar', calendar_update_event: 'calendar',
  calendar_delete_event: 'calendar',
  // email
  email_list_folders: 'email', email_list: 'email', email_search: 'email',
  email_read: 'email',   email_send: 'email', email_reply: 'email',
  // github
  github_list_repos: 'github', github_upcoming_milestones: 'github',
  github_list_milestones: 'github', github_list_issues: 'github',
  github_get_issue: 'github',
  github_create_issue: 'github', github_update_issue: 'github',
  github_create_milestone: 'github', github_sync: 'github',
  // social (LinkedIn / Instagram / X)
  social_accounts_list: 'social', social_post_draft: 'social',
  social_post_publish: 'social', social_posts_list: 'social', social_post_get: 'social',
  social_metrics_summary: 'social',
  social_campaigns_list: 'social', social_campaign_create: 'social',
  social_growth: 'social',
  // artifacts
  artifact_create: 'artifacts', artifact_get: 'artifacts', artifact_merge_data: 'artifacts',
  artifact_update_state: 'artifacts', artifact_list: 'artifacts', artifact_delete: 'artifacts',
  artifact_link_resource: 'artifacts', artifact_design: 'artifacts',
  // feeders
  feeder_create: 'feeders', feeder_list: 'feeders', feeder_run: 'feeders',
  feeder_update_script: 'feeders', feeder_delete: 'feeders', feeder_history: 'feeders',
  feeder_secret_request: 'feeders',
  // flashcards
  flashcard_create: 'flashcards',
  // notebook
  notebook_get: 'notebook', notebook_add_cell: 'notebook', notebook_update_cell: 'notebook',
  notebook_delete_cell: 'notebook',
  // office (excel / docx / ppt)
  excel_get: 'office', excel_get_file_path: 'office', excel_set_cell: 'office',
  excel_set_range: 'office', excel_add_row: 'office', excel_add_sheet: 'office',
  excel_create: 'office', excel_export: 'office',
  docx_get: 'office', docx_get_file_path: 'office', docx_create: 'office',
  docx_update: 'office', docx_delete: 'office',
  ppt_create: 'office', ppt_get_file_path: 'office', ppt_get_slides: 'office',
  ppt_get_slide_images: 'office', ppt_export: 'office',
  // vision
  image_describe: 'vision', screen_understand: 'vision',
  // docs / meta
  dome_load_doc: 'docs', get_tool_definition: 'docs', skill_read: 'docs',
  // entities (create)
  agent_create: 'entities', automation_create: 'entities', workflow_create: 'entities',
  // marketplace
  marketplace_search: 'marketplace', marketplace_install: 'marketplace',
  // browser
  browser_get_active_tab: 'browser',
  // image
  image_crop: 'image', image_thumbnail: 'image',
  // file
  file_read: 'file', file_write: 'file', file_list: 'file', file_tree: 'file', file_search: 'file',
  // shell
  shell_exec: 'shell',
  // studio / generate
  generate_knowledge_graph: 'studio', generate_mindmap: 'studio', generate_quiz: 'studio',
  generate_guide: 'studio', generate_faq: 'studio', generate_timeline: 'studio',
  generate_table: 'studio',
  // ui automation
  ui_point_to: 'ui', ui_click: 'ui', ui_type: 'ui', ui_scroll: 'ui', ui_navigate: 'ui',
  ui_get_elements: 'ui', ui_hide_cursor: 'ui',
  // pipelines (kanban)
  pipeline_list: 'pipelines', pipeline_get: 'pipelines', pipeline_create_card: 'pipelines',
  pipeline_move_card: 'pipelines', pipeline_run_card: 'pipelines', pipeline_add_stage: 'pipelines',
};

/** Total number of tools tracked here. Asserted in tests against the catalog. */
export const TOOL_COUNT = Object.keys(TOOL_FAMILIES).length;

/** Resolve the family for a tool name (`'misc'` for unknown tools). */
export function familyOf(name: string): ToolFamily {
  return TOOL_FAMILIES[name] ?? 'misc';
}

/** All tool names in a given family. */
export function toolsInFamily(family: ToolFamily): string[] {
  return Object.keys(TOOL_FAMILIES).filter((n) => TOOL_FAMILIES[n] === family);
}
