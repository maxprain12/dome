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
  if (message.pinnedResources?.length) score += 50 + message.pinnedResources.length * 10;
  if (message.attachments?.images?.length || message.attachments?.videos?.length) score += 40;
  return score;
}

function messagesLikelySame(a: ManyMessage, b: ManyMessage): boolean {
  if (a.role !== b.role) return false;
  const aContent = a.content.trim();
  const bContent = b.content.trim();
  if (aContent === bContent) return true;
  // Empty user turns (chip-only pins) pair by timestamp proximity.
  if (a.role === 'user' && !aContent && !bContent) {
    return Math.abs(a.timestamp - b.timestamp) < 15_000;
  }
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

/** Keep composer UI fields that JSONL harness conversion never stores. */
function preserveLocalUiFields(localMsg: ManyMessage, incoming: ManyMessage): ManyMessage {
  return {
    ...incoming,
    pinnedResources:
      incoming.pinnedResources?.length
        ? incoming.pinnedResources
        : localMsg.pinnedResources,
    attachments: incoming.attachments ?? localMsg.attachments,
  };
}

function alignPreservingLocalUi(local: ManyMessage[], db: ManyMessage[]): ManyMessage[] {
  const result = db.map((msg) => ({ ...msg }));
  const matchedLocal = new Set<number>();

  for (let di = 0; di < result.length; di++) {
    const dbMessage = result[di]!;
    const matchIndex = local.findIndex(
      (localMessage, index) =>
        !matchedLocal.has(index) && messagesLikelySame(localMessage, dbMessage),
    );
    if (matchIndex < 0) continue;
    matchedLocal.add(matchIndex);
    result[di] = preserveLocalUiFields(local[matchIndex]!, dbMessage);
  }

  // Local-only user turns with pins/attachments (dropped or not yet in JSONL).
  for (let li = 0; li < local.length; li++) {
    if (matchedLocal.has(li)) continue;
    const localMessage = local[li]!;
    if (
      localMessage.role === 'user' &&
      ((localMessage.pinnedResources?.length ?? 0) > 0 || localMessage.attachments)
    ) {
      result.push(localMessage);
    }
  }

  return result.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Merge localStorage Many messages with SQLite/JSONL session rows.
 * Never drops assistant turns that exist locally when DB is incomplete.
 * Never drops pin/attachment UI fields that only live in the local store.
 */
export function mergeManySessionMessages(local: ManyMessage[], db: ManyMessage[]): ManyMessage[] {
  if (db.length === 0) return [...local];
  if (local.length === 0) return [...db];

  const localAssistants = local.filter((m) => m.role === 'assistant').length;
  const dbAssistants = db.filter((m) => m.role === 'assistant').length;

  if (db.length >= local.length && dbAssistants >= localAssistants) {
    if (totalRichness(db) >= totalRichness(local)) {
      return alignPreservingLocalUi(local, db);
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
        result[matchIndex] = preserveLocalUiFields(result[matchIndex]!, dbMessage);
      }
      continue;
    }
    result.push(dbMessage);
  }

  return result.sort((a, b) => a.timestamp - b.timestamp);
}
