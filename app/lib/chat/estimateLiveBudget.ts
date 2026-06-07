import type { BudgetBreakdown } from '@/lib/chat/contextUsage';
import type { ChatMessageData } from '@/components/chat/ChatMessage';

function approxTokens(chars: number): number {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  return Math.max(1, Math.ceil(chars / 4));
}

function payloadChars(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'string') return value.length;
  try {
    return JSON.stringify(value).length;
  } catch {
    return String(value).length;
  }
}

/**
 * Extends the run-start budget snapshot with in-flight stream content and tool cards.
 */
export function estimateLiveBudget(
  base: BudgetBreakdown,
  streaming: ChatMessageData | null,
): BudgetBreakdown {
  if (!streaming) return base;

  let extraChars = 0;
  if (streaming.content) extraChars += streaming.content.length;
  if (streaming.thinking) extraChars += streaming.thinking.length;
  for (const tc of streaming.toolCalls ?? []) {
    extraChars += payloadChars(tc.name);
    extraChars += payloadChars(tc.arguments);
    extraChars += payloadChars(tc.result);
  }

  const delta = approxTokens(extraChars);
  if (delta === 0) return base;

  return {
    ...base,
    historyApprox: base.historyApprox + delta,
    conversationApprox: (base.conversationApprox ?? base.historyApprox) + delta,
    totalApprox: base.totalApprox + delta,
  };
}
