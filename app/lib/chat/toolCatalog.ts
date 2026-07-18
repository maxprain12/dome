/**
 * Canonical tool naming + subagent labels for chat UI (display + streaming).
 * Aligns Dome native tool ids (`file_write`, `web_search`, …) with i18n keys.
 */

export const SUBAGENT_TYPES = ['research', 'library', 'writer', 'data'] as const;
export type SubagentType = (typeof SUBAGENT_TYPES)[number];

/** Legacy / alias tool ids → canonical id used for icons + grouping. */
export const TOOL_NAME_ALIASES: Record<string, string> = {
  write_file: 'file_write',
  read_file: 'file_read',
  edit_file: 'file_write',
  ls: 'file_list',
  glob: 'file_search',
  call_research_agent: 'task',
  call_library_agent: 'task',
  call_writer_agent: 'task',
  call_data_agent: 'task',
};

export function canonicalToolName(name: string): string {
  const raw = (name || '').trim().toLowerCase();
  return TOOL_NAME_ALIASES[raw] ?? raw;
}

export function normalizeToolId(name: string): string {
  return canonicalToolName(name)
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function isSubagentType(value: string): value is SubagentType {
  return (SUBAGENT_TYPES as readonly string[]).includes(value);
}

export function subagentTypeFromTaskArgs(args: Record<string, unknown> | undefined): string {
  if (!args) return '';
  const raw = String(args.subagent_type ?? args.subagentType ?? args.name ?? '').trim().toLowerCase();
  return raw;
}

export function subagentTypeFromDelegateArgs(args: Record<string, unknown> | undefined): string {
  if (!args) return '';
  return String(args.agent ?? args.subagent ?? '').trim().toLowerCase();
}

/** Strip streaming ellipsis from i18n tool labels for card titles. */
export function stripStreamingEllipsis(label: string): string {
  return label.replace(/\.{3}$/, '').replace(/…$/, '').trim();
}

export type ToolLabelT = (key: string, opts?: { defaultValue?: string }) => string;

export function getSubagentDisplayLabel(agentKey: string, t: ToolLabelT): string {
  const key = normalizeToolId(agentKey);
  if (isSubagentType(key)) {
    const i18nKey = `chat.subagent_${key}`;
    const tr = t(i18nKey);
    if (tr !== i18nKey) return tr;
  }
  return agentKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
