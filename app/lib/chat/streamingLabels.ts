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

/** Options for the active-run status row (not cross-session background runs). */
export interface ActiveRunLabelOptions {
  /** Run belongs to another chat session (history list / cross-session). */
  otherSession?: boolean;
  waitingApproval?: boolean;
  hasContent?: boolean;
  /** Reconnecting to an in-flight run after tab/window switch. */
  reconnecting?: boolean;
}

/**
 * Semantic streaming label for the chat surface the user is actively viewing.
 * Reserve `chat.running_background` only for {@link ActiveRunLabelOptions.otherSession}.
 */
export function streamingLabelForActiveRun(t: TFunction, opts: ActiveRunLabelOptions): string {
  if (opts.otherSession) return t('chat.running_background');
  if (opts.waitingApproval) return t('chat.waiting_approval');
  if (opts.hasContent) return t('chat.generating_response');
  if (opts.reconnecting) return t('chat.reconnecting_run');
  return t('chat.thinking_evaluating_tools');
}

/** Resolve a streaming label from run metadata emitted by the main process. */
export function streamingLabelFromRunMetadata(
  t: TFunction,
  metadata: Record<string, unknown> | undefined,
  fallback?: ActiveRunLabelOptions,
): string {
  const labelKey = metadata?.uiLabelKey;
  if (typeof labelKey === 'string' && labelKey.startsWith('chat.')) {
    return t(labelKey);
  }
  const detail = metadata?.uiPhaseDetail;
  if (typeof detail === 'string' && detail.trim()) {
    return streamingLabelForToolName(detail, t);
  }
  if (fallback) return streamingLabelForActiveRun(t, fallback);
  return t('chat.processing');
}
