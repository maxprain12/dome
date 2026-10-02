/**
 * Human-readable tool labels (short names for TUI / agent tool registry).
 * Keep in sync with `app/lib/chat` i18n keys where possible.
 */
export const TOOL_LABELS: Readonly<Record<string, string>> = {
  // Web
  browser_configure: 'Configure Browser',
  browser_sessions: 'Browser Sessions',
  browser_read_page: 'Read Page',
  browser_screenshot: 'Page Screenshot',
  browser_navigate: 'Open Page',
  browser_go_back: 'Previous Page',
  browser_click: 'Click Element',
  browser_fill: 'Fill Field',
  browser_fill_secret: 'Fill Secret',
  browser_select: 'Select Option',
  browser_scroll: 'Scroll Page',
  browser_find: 'Find on Page',
  browser_wait: 'Wait for Page',
  browser_tabs: 'Browser Tabs',
  browser_new_tab: 'Open Tab',
  browser_switch_tab: 'Switch Tab',
  browser_close_tab: 'Close Tab',
  browser_send_keys: 'Send Keys',
  browser_upload_file: 'Upload File',
  browser_evaluate: 'Evaluate Page',
  browser_extract: 'Extract Page Data',
  browser_read_file: 'Read Browser File',
  browser_write_file: 'Write Browser File',
  browser_replace_file: 'Replace File Text',
  browser_export_state: 'Save Browser State',
  browser_import_state: 'Restore Browser State',
  browser_downloads: 'Browser Downloads',
  browser_done: 'Browser Result',
  web_search: 'Web Search',
  web_fetch: 'Web Fetch',
  // File
  file_read: 'Read File',
  file_write: 'Write File',
  file_list: 'List Directory',
  file_tree: 'File Tree',
  file_search: 'Search Files',
  file_grep: 'Grep',
  file_find: 'Find Files',
  file_edit: 'Edit File',
  // Shell
  shell_exec: 'Shell',
  // Git (local working copy)
  git_status: 'Git Status',
  git_diff: 'Git Diff',
  git_log: 'Git Log',
  git_branch_create: 'New Branch',
  git_add: 'Stage',
  git_commit: 'Commit',
  // Delegation
  task: 'Subagent',
  delegate_to_agent: 'Delegate',
  write_todos: 'Plan',
  // Docs / meta
  dome_load_doc: 'Load Doc',
  get_tool_definition: 'Get Tool Definition',
  skill_read: 'Read Skill',
  // Social hub
  social_accounts_list: 'Social Accounts',
  social_post_draft: 'Social Draft',
  social_post_publish: 'Social Publish',
  social_posts_list: 'Social Posts',
  social_post_get: 'Social Post',
  social_metrics_summary: 'Social Analytics',
  social_public_resolve: 'Social URL',
  social_reference_save: 'Save Reference',
  social_reference_list: 'Social References',
  social_watchlists_list: 'Watchlists',
  social_watchlist_add: 'Watchlist Add',
  social_competitive_report: 'Competitive Report',
  social_trends_snapshot: 'Social Trends',
  social_campaign_from_references: 'Campaign From References',
  github_get_issue: 'GitHub Issue',
  github_get_pull_request: 'Pull Request',
  github_list_pull_requests: 'Pull Requests',
  github_create_pull_request: 'Open PR',
  github_pr_checks: 'PR Checks',
  people_get: 'Person',
  people_search: 'Search people',
  people_upsert: 'Upsert person',
  people_link_identity: 'Link identity',
  people_add_interaction: 'People note',
  people_ingest: 'Ingest people',
  email_read: 'Read Email',
  // Artifacts
  artifact_create: 'Artifact Create',
  artifact_get: 'Artifact Get',
  artifact_update_state: 'Artifact Update',
  artifact_merge_data: 'Artifact Merge',
};

export function labelForTool(name: string): string {
  const key = (name || '').trim();
  if (!key) return 'Tool';
  return TOOL_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
