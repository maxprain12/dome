/**
 * ChatToolCard config (03/T02 — extracted from ChatToolCard.tsx):
 * tool→category/icon mapping and codegen preview limits. Pure data.
 */

import {
  Bot,
  Calendar,
  Crop,
  Database,
  FileCode2,
  FilePenLine,
  FilePlus2,
  FileText,
  FileTextIcon,
  FolderSearch,
  FolderTree,
  GitBranch,
  Globe,
  GraduationCap,
  Image,
  Layers,
  Network,
  Plug,
  Search,
  ShoppingBag,
  Terminal,
  Users,
  Zap,
} from 'lucide-react';

export type ToolCategory = 'search' | 'file' | 'agent' | 'db' | 'mcp' | 'default';

/** Category color accent (border/dot color) using CSS variables for theme compatibility */
export const CATEGORY_COLORS: Record<ToolCategory, string> = {
  search: 'var(--accent)',   // blue
  file: 'var(--success)',     // green
  agent: 'var(--accent)',    // purple
  db: 'var(--warning)',       // orange
  mcp: 'var(--secondary-text)',      // gray
  default: 'var(--secondary-text)',  // gray
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

export const TOOL_ICONS: Record<string, typeof Globe> = {
  web_search: Search,
  web_fetch: Globe,
  deep_research: Search,
  file_search: FolderSearch,
  delegate_to_agent: Users,
  resource_create: FileText,
  resource_get: FileText,
  resource_search: Search,
  call_research_agent: Search,
  call_library_agent: FileText,
  call_writer_agent: FileText,
  call_data_agent: Database,
  start_async_subagent_task: GitBranch,
  check_async_subagent_task: GitBranch,
  update_async_subagent_task: GitBranch,
  cancel_async_subagent_task: GitBranch,
  list_async_subagent_tasks: GitBranch,
  notebook_add_cell: FileText,
  notebook_update_cell: FileText,
  notebook_delete_cell: FileText,
  pdf_extract_text: FileTextIcon,
  pdf_get_metadata: FileTextIcon,
  pdf_get_structure: FileTextIcon,
  pdf_summarize: FileTextIcon,
  pdf_extract_tables: FileTextIcon,
  pdf_render_page: Image,
  marketplace_search: ShoppingBag,
  marketplace_install: ShoppingBag,
  browser_get_active_tab: Globe,
  workflow_create: GitBranch,
  agent_create: Bot,
  automation_create: Zap,
  image_crop: Crop,
  image_thumbnail: Layers,
  generate_mindmap: Network,
  generate_quiz: GraduationCap,
  generate_knowledge_graph: Network,
  calendar_list_events: Calendar,
  calendar_list: Calendar,
  calendar_get_upcoming: Calendar,
  calendar_create: Calendar,
  calendar_create_event: Calendar,
  calendar_update: Calendar,
  calendar_update_event: Calendar,
  calendar_delete: Calendar,
  calendar_delete_event: Calendar,
  flashcard_create: Layers,
  // Filesystem / codegen (deepagents harness + Dome aliases)
  write_file: FilePlus2,
  file_write: FilePlus2,
  edit_file: FilePenLine,
  read_file: FileCode2,
  file_read: FileCode2,
  glob: FolderSearch,
  ls: FolderTree,
  file_list: FolderTree,
  file_tree: FolderTree,
  shell_exec: Terminal,
  // Subagent delegation (deepagents `task`)
  task: Users,
};

export function getIconForTool(name: string): typeof Globe {
  const norm = (name || '').toLowerCase();
  if (TOOL_ICONS[norm]) return TOOL_ICONS[norm];
  if (TOOL_ICONS[name]) return TOOL_ICONS[name];
  if (norm.includes('postgres') || norm.includes('sql') || norm.includes('query') || norm.includes('database')) return Database;
  if (norm.includes('mcp_') || norm.startsWith('mcp')) return Plug;
  return Globe;
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

