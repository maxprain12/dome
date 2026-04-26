import type { TFunction } from 'i18next';

/** Keys cycled in agent chat while waiting (before tools). */
export const CHAT_THINKING_ROTATION_KEYS = [
  'chat.thinking_l1',
  'chat.thinking_l2',
  'chat.thinking_l3',
  'chat.thinking_l4',
  'chat.thinking_l5',
  'chat.thinking_l6',
] as const;

/** i18n label for tool / subagent streaming (uses `chat.tool_<name>` if present). */
export function streamingLabelForToolName(name: string | undefined, t: TFunction): string {
  if (!name) return `${t('chat.tool_label_suffix')}...`;
  const fullKey = `chat.tool_${name}`;
  const tr = t(fullKey);
  if (tr !== fullKey) return tr;
  return `${t('chat.stream_tool_fallback', { name: name.replace(/_/g, ' ') })}...`;
}
