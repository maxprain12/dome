/**
 * ChatToolCard config (03/T02 — extracted from ChatToolCard.tsx):
 * tool→category/icon mapping and codegen preview limits. Pure data.
 */

import type { IconSvgElement } from '@hugeicons/react';
import {
  BotIcon,
  Calendar03Icon,
  CropIcon,
  DatabaseIcon,
  File02Icon,
  FileAddIcon,
  FileCodeIcon,
  FileEditIcon,
  FolderSearchIcon,
  FolderTreeIcon,
  GitBranchIcon,
  GlobeIcon,
  GraduationCapIcon,
  HierarchySquare01Icon,
  Image01Icon,
  Layers01Icon,
  Plug01Icon,
  Search01Icon,
  ShoppingBag01Icon,
  TerminalIcon,
  UserMultiple02Icon,
  ZapIcon,
} from '@hugeicons/core-free-icons';

export type ToolCategory = 'search' | 'file' | 'agent' | 'db' | 'mcp' | 'default';

/** Category color accent (border/dot color) using CSS variables for theme compatibility */
export const CATEGORY_COLORS: Record<ToolCategory, string> = {
  search: 'var(--primary)',   // blue
  file: 'var(--success)',     // green
  agent: 'var(--primary)',    // purple
  db: 'var(--warning)',       // orange
  mcp: 'var(--muted-foreground)',      // gray
  default: 'var(--muted-foreground)',  // gray
};

export function getCategory(name: string): ToolCategory {
  const n = (name || '').toLowerCase();
  if (n.includes('search') || n.includes('web_fetch') || n.includes('web_search') || n.includes('fetch')) return 'search';
  if (n.includes('calendar')) return 'db';
  if (n.includes('marketplace')) return 'mcp';
  if (n.includes('flashcard')) return 'file';
  if (n.includes('pdf') || n.includes('file') || n.includes('resource') || n.includes('image') || n.includes('notebook')) return 'file';
  if (n === 'glob' || n === 'ls' || n.includes('shell') || n.includes('codegen')) return 'file';
  if (n === 'task' || n.includes('subagent') || n.includes('agent') || n.includes('call_') || n.includes('delegate')) return 'agent';
  if (n.includes('postgres') || n.includes('sql') || n.includes('query') || n.includes('database') || n.includes('db')) return 'db';
  if (n.startsWith('mcp') || n.includes('mcp_')) return 'mcp';
  return 'default';
}

export const TOOL_ICONS: Record<string, IconSvgElement> = {
  web_search: Search01Icon,
  web_fetch: GlobeIcon,
  deep_research: Search01Icon,
  file_search: FolderSearchIcon,
  delegate_to_agent: UserMultiple02Icon,
  resource_create: File02Icon,
  resource_get: File02Icon,
  resource_search: Search01Icon,
  call_research_agent: Search01Icon,
  call_library_agent: File02Icon,
  call_writer_agent: File02Icon,
  call_data_agent: DatabaseIcon,
  start_async_subagent_task: GitBranchIcon,
  check_async_subagent_task: GitBranchIcon,
  update_async_subagent_task: GitBranchIcon,
  cancel_async_subagent_task: GitBranchIcon,
  list_async_subagent_tasks: GitBranchIcon,
  notebook_add_cell: File02Icon,
  notebook_update_cell: File02Icon,
  notebook_delete_cell: File02Icon,
  pdf_extract_text: File02Icon,
  pdf_get_metadata: File02Icon,
  pdf_get_structure: File02Icon,
  pdf_summarize: File02Icon,
  pdf_extract_tables: File02Icon,
  pdf_render_page: Image01Icon,
  marketplace_search: ShoppingBag01Icon,
  marketplace_install: ShoppingBag01Icon,
  browser_get_active_tab: GlobeIcon,
  workflow_create: GitBranchIcon,
  agent_create: BotIcon,
  automation_create: ZapIcon,
  image_crop: CropIcon,
  image_thumbnail: Layers01Icon,
  generate_mindmap: HierarchySquare01Icon,
  generate_quiz: GraduationCapIcon,
  generate_knowledge_graph: HierarchySquare01Icon,
  calendar_list_events: Calendar03Icon,
  calendar_list: Calendar03Icon,
  calendar_get_upcoming: Calendar03Icon,
  calendar_create: Calendar03Icon,
  calendar_create_event: Calendar03Icon,
  calendar_update: Calendar03Icon,
  calendar_update_event: Calendar03Icon,
  calendar_delete: Calendar03Icon,
  calendar_delete_event: Calendar03Icon,
  flashcard_create: Layers01Icon,
  // Filesystem / codegen (deepagents harness + Dome aliases)
  write_file: FileAddIcon,
  file_write: FileAddIcon,
  edit_file: FileEditIcon,
  read_file: FileCodeIcon,
  file_read: FileCodeIcon,
  glob: FolderSearchIcon,
  ls: FolderTreeIcon,
  file_list: FolderTreeIcon,
  file_tree: FolderTreeIcon,
  shell_exec: TerminalIcon,
  // Subagent delegation (deepagents `task`)
  task: UserMultiple02Icon,
};

export function getIconForTool(name: string): IconSvgElement {
  const norm = (name || '').toLowerCase();
  if (TOOL_ICONS[norm]) return TOOL_ICONS[norm];
  if (TOOL_ICONS[name]) return TOOL_ICONS[name];
  if (norm.includes('postgres') || norm.includes('sql') || norm.includes('query') || norm.includes('database')) return DatabaseIcon;
  if (norm.includes('mcp_') || norm.startsWith('mcp')) return Plug01Icon;
  return GlobeIcon;
}

/** Parse result as document-style array [{ content, metadata }] */
export const EXT_LANG: Record<string, string> = {
  html: 'HTML', htm: 'HTML', css: 'CSS', scss: 'SCSS',
  js: 'JS', jsx: 'JSX', mjs: 'JS', cjs: 'JS',
  ts: 'TS', tsx: 'TSX', py: 'Python', rb: 'Ruby', go: 'Go',
  rs: 'Rust', java: 'Java', json: 'JSON', md: 'Markdown',
  sh: 'Shell', bash: 'Shell', yml: 'YAML', yaml: 'YAML', sql: 'SQL', toml: 'TOML',
};

export const CODEGEN_MAX_LINES = 48;
export const CODEGEN_MAX_CHARS = 2400;
