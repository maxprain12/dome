'use strict';

const PLAN_WRITE_TOOLS = Object.freeze([
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
]);

const PLAN_WRITE_SET = new Set(PLAN_WRITE_TOOLS);

const { QUESTIONNAIRE_TOOL_DEFINITION, isQuestionnaireTool } = require('./many-plan.cjs');

const PLAN_MODE_PROMPT = [
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

const DRAFT_MODE_PROMPT = [
  'DRAFT MODE ACTIVE.',
  'Draft and propose. Prefer read tools and written proposals.',
  'Any mutation (create, update, delete, send, publish, shell, git) requires human approval before it runs.',
].join('\n');

function parseManyAgentMode(raw) {
  const value = String(raw || '')
    .trim()
    .toLowerCase();
  if (value === 'plan' || value === 'draft' || value === 'agent') return value;
  return 'agent';
}

function toolDefName(def) {
  return def?.function?.name || def?.name || '';
}

function filterToolDefinitionsForMode(defs, mode) {
  const list = Array.isArray(defs) ? defs.slice() : [];
  if (mode !== 'plan') {
    return list.filter((def) => !isQuestionnaireTool(toolDefName(def)));
  }
  const filtered = list.filter((def) => {
    const name = toolDefName(def);
    return !PLAN_WRITE_SET.has(name);
  });
  if (!filtered.some((def) => isQuestionnaireTool(toolDefName(def)))) {
    filtered.push(QUESTIONNAIRE_TOOL_DEFINITION);
  }
  return filtered;
}

function extraHitlToolNames(mode) {
  if (mode === 'plan') return ['questionnaire'];
  if (mode !== 'draft') return [];
  return [...PLAN_WRITE_TOOLS];
}

function promptOverlayForAgentMode(mode) {
  if (mode === 'plan') return PLAN_MODE_PROMPT;
  if (mode === 'draft') return DRAFT_MODE_PROMPT;
  return null;
}

function applyAgentModeToMessages(messages, mode) {
  const overlay = promptOverlayForAgentMode(mode);
  if (!overlay || !Array.isArray(messages) || messages.length === 0) return messages || [];
  const next = messages.map((row) => ({ ...row }));
  const system = next.find((row) => row && row.role === 'system');
  if (system && typeof system.content === 'string') {
    system.content = `${system.content}\n\n${overlay}`;
    return next;
  }
  return [{ role: 'system', content: overlay }, ...next];
}

module.exports = {
  parseManyAgentMode,
  filterToolDefinitionsForMode,
  extraHitlToolNames,
  promptOverlayForAgentMode,
  applyAgentModeToMessages,
  PLAN_WRITE_TOOLS,
};
