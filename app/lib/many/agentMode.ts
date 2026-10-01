import policy from '../../../shared/many-mode-policy.json';
import { extractPlanTodoItems, isQuestionnaireTool } from './planDocument';

export const MANY_AGENT_MODES = ['plan', 'draft', 'agent'] as const;

export type ManyAgentMode = (typeof MANY_AGENT_MODES)[number];

const PLAN_WRITE_TOOLS = policy.writeTools;
const PLAN_WRITE_SET = new Set<string>(PLAN_WRITE_TOOLS);
export const PLAN_MODE_PROMPT = policy.prompts.plan.join('\n');
export const DRAFT_MODE_PROMPT = policy.prompts.draft.join('\n');

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

export function promptOverlayForAgentMode(mode: ManyAgentMode): string {
  return policy.prompts[parseManyAgentMode(mode)].join('\n');
}

export function extractPlanTodos(text: string): string[] {
  return extractPlanTodoItems(text).map((item) => item.text);
}

export function draftHitlToolNames(): string[] {
  return [...PLAN_WRITE_TOOLS];
}
