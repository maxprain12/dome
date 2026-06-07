import type { TFunction } from 'i18next';
import { getToolDisplayLabelForCall } from '@/lib/chat/toolDisplayLabels';

/** Keys cycled in agent chat while waiting (before tools). */
export const CHAT_THINKING_ROTATION_KEYS = [
  'chat.thinking_l1',
  'chat.thinking_l2',
  'chat.thinking_l3',
  'chat.thinking_l4',
  'chat.thinking_l5',
  'chat.thinking_l6',
] as const;

export interface StreamingLabelToolCall {
  name?: string;
  arguments?: Record<string, unknown>;
  agentName?: string;
}

/** i18n label for tool / subagent streaming (uses enriched tool catalog). */
export function streamingLabelForToolName(name: string | undefined, t: TFunction): string {
  if (!name) return `${t('chat.tool_label_suffix')}...`;
  const label = getToolDisplayLabelForCall({ name, arguments: {} }, t, true);
  if (label.endsWith('...') || label.endsWith('…')) return label;
  return `${label}...`;
}

export function streamingLabelForToolCall(toolCall: StreamingLabelToolCall, t: TFunction): string {
  if (!toolCall.name) return `${t('chat.tool_label_suffix')}...`;
  const label = getToolDisplayLabelForCall(
    { name: toolCall.name, arguments: toolCall.arguments ?? {} },
    t,
    true,
  );
  if (label.endsWith('...') || label.endsWith('…')) return label;
  return `${label}...`;
}
