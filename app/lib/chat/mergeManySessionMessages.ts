import type { ManyMessage } from '@/lib/store/useManyStore';

function toolCallRichness(
  tc: NonNullable<ManyMessage['toolCalls']>[number],
): number {
  let score = 1;
  if (tc.result !== undefined) score += 200;
  if (tc.status === 'success' || tc.status === 'error') score += 20;
  return score;
}

function messageRichness(message: ManyMessage): number {
  let score = message.content.length;
  if (message.toolCalls?.length) {
    score += 1000 + message.toolCalls.reduce((sum, tc) => sum + toolCallRichness(tc), 0);
  }
  if (message.thinking) score += 500;
  return score;
}

function messagesLikelySame(a: ManyMessage, b: ManyMessage): boolean {
  if (a.role !== b.role) return false;
  const aContent = a.content.trim();
  const bContent = b.content.trim();
  if (aContent === bContent) return true;
  if (aContent.length > 0 && bContent.length > 0) {
    const prefixLen = Math.min(120, aContent.length, bContent.length);
    if (aContent.slice(0, prefixLen) === bContent.slice(0, prefixLen)) return true;
    if (aContent.includes(bContent) || bContent.includes(aContent)) return true;
  }
  const aTools = a.toolCalls?.length ?? 0;
  const bTools = b.toolCalls?.length ?? 0;
  if (aTools > 0 && aTools === bTools && !aContent && !bContent) return true;
  return Math.abs(a.timestamp - b.timestamp) < 8000;
}

function totalRichness(messages: ManyMessage[]): number {
  return messages.reduce((sum, message) => sum + messageRichness(message), 0);
}

/**
 * Merge localStorage Many messages with SQLite session rows.
 * Never drops assistant turns that exist locally when DB is incomplete.
 */
export function mergeManySessionMessages(local: ManyMessage[], db: ManyMessage[]): ManyMessage[] {
  if (db.length === 0) return [...local];
  if (local.length === 0) return [...db];

  const localAssistants = local.filter((m) => m.role === 'assistant').length;
  const dbAssistants = db.filter((m) => m.role === 'assistant').length;

  if (db.length >= local.length && dbAssistants >= localAssistants) {
    if (totalRichness(db) >= totalRichness(local)) {
      return [...db];
    }
  }

  const result = [...local];
  const matchedLocal = new Set<number>();

  for (const dbMessage of db) {
    const matchIndex = result.findIndex(
      (localMessage, index) =>
        !matchedLocal.has(index) && messagesLikelySame(localMessage, dbMessage),
    );
    if (matchIndex >= 0) {
      matchedLocal.add(matchIndex);
      if (messageRichness(dbMessage) >= messageRichness(result[matchIndex]!)) {
        result[matchIndex] = dbMessage;
      }
      continue;
    }
    result.push(dbMessage);
  }

  return result.sort((a, b) => a.timestamp - b.timestamp);
}
