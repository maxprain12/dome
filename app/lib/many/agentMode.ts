import { extractPlanTodoItems, isQuestionnaireTool } from './planDocument';

export const MANY_AGENT_MODES = ['plan', 'draft', 'agent'] as const;

export type ManyAgentMode = (typeof MANY_AGENT_MODES)[number];

const PLAN_WRITE_TOOLS = [
  'resource_create',
  'resource_update',
  'resource_delete',
  'resource_move_to_folder',
  'calendar_create_event',
  'calendar_update_event',
  'calendar_delete_event',
  'flashcard_create',
  'artifact_create',
  'artifact_update_state',
  'artifact_merge_data',
  'artifact_delete',
  'ppt_create',
  'docx_create',
  'docx_update',
  'docx_delete',
  'excel_create',
  'excel_set_cell',
  'excel_set_range',
  'excel_add_row',
  'excel_add_sheet',
  'social_post_draft',
  'social_post_publish',
  'social_campaign_create',
  'email_send',
  'email_reply',
  'shell_exec',
  'git_branch_create',
  'git_commit',
  'pipeline_create_card',
  'pipeline_move_card',
  'pipeline_run_card',
  'pipeline_add_stage',
  'github_create_issue',
  'github_update_issue',
  'github_create_milestone',
  'notebook_run_cell',
  'notebook_add_cell',
  'generate_quiz',
  'generate_mindmap',
  'generate_guide',
  'generate_faq',
  'generate_timeline',
  'generate_table',
  'generate_audio_overview',
  'generate_video_overview',
  'pdf_annotation_create',
  'link_resources',
] as const;

const PLAN_WRITE_SET = new Set<string>(PLAN_WRITE_TOOLS);

export const PLAN_MODE_PROMPT = [
  '[PLAN MODE ACTIVE]',
  'You are in plan mode — a read-only exploration mode.',
  'You may inspect, search, and reason. You must not mutate files, notes, calendar, social, email, git, or the shell.',
  'Ask clarifying questions using the questionnaire tool. Do not dump questions as markdown bullets.',
  'Create a detailed numbered plan under a "Plan:" header. When the work has phases, a flow, or architecture, include a mermaid diagram in a ```mermaid fence (flowchart or sequence). Keep node labels human; never dump ids.',
  '',
  'Plan:',
  '1. First step description',
  '2. Second step description',
  '',
  '```mermaid',
  'flowchart TD',
  '  A[Inspect] --> B[Decide]',
  '```',
  '',
  'After the plan, stop. The user taps Execute, Stay, or Refine in the dock. Do not ask them to type Ejecuta.',
  'Do NOT execute the plan until the user chooses Execute.',
].join('\n');

export const DRAFT_MODE_PROMPT = [
  'DRAFT MODE ACTIVE.',
  'Draft and propose. Prefer read tools and written proposals.',
  'Any mutation (create, update, delete, send, publish, shell, git) requires human approval before it runs.',
].join('\n');

export function parseManyAgentMode(raw: unknown): ManyAgentMode {
  const value = String(raw || '')
    .trim()
    .toLowerCase();
  if (value === 'plan' || value === 'draft' || value === 'agent') return value;
  return 'agent';
}

/** `/plan`, `/draft`, `/agent` as the whole composer command. */
export function parseComposerModeCommand(raw: unknown): ManyAgentMode | null {
  const value = String(raw || '')
    .trim()
    .toLowerCase();
  if (value === '/plan' || value === '/draft' || value === '/agent') {
    return value.slice(1) as ManyAgentMode;
  }
  return null;
}

export function isSlashModeId(id: string): boolean {
  return id.startsWith('mode:');
}

export function modeFromSlashId(id: string): ManyAgentMode | null {
  if (!isSlashModeId(id)) return null;
  const raw = id.slice('mode:'.length);
  if (raw === 'plan' || raw === 'draft' || raw === 'agent') return raw;
  return null;
}

export function filterSlashModes(query: string): ManyAgentMode[] {
  const needle = String(query || '')
    .trim()
    .toLowerCase();
  if (!needle) return [...MANY_AGENT_MODES];
  return MANY_AGENT_MODES.filter((mode) => mode.startsWith(needle) || mode.includes(needle));
}

export function isPlanWriteTool(name: string): boolean {
  return PLAN_WRITE_SET.has(name);
}

export function filterToolsForAgentMode<T extends { name: string }>(
  tools: T[],
  mode: ManyAgentMode,
): T[] {
  if (mode !== 'plan') {
    return tools.filter((tool) => !isQuestionnaireTool(tool.name));
  }
  return tools.filter((tool) => !PLAN_WRITE_SET.has(tool.name));
}

export function filterToolIdsForAgentMode(toolIds: string[], mode: ManyAgentMode): string[] {
  if (mode !== 'plan') {
    return toolIds.filter((id) => !isQuestionnaireTool(id));
  }
  const next = toolIds.filter((id) => !PLAN_WRITE_SET.has(id));
  if (!next.includes('questionnaire')) next.push('questionnaire');
  return next;
}

export function promptOverlayForAgentMode(mode: ManyAgentMode): string | null {
  if (mode === 'plan') return PLAN_MODE_PROMPT;
  if (mode === 'draft') return DRAFT_MODE_PROMPT;
  return null;
}

export function extractPlanTodos(text: string): string[] {
  return extractPlanTodoItems(text).map((item) => item.text);
}

export function draftHitlToolNames(): string[] {
  return [...PLAN_WRITE_TOOLS];
}
