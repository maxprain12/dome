import type { ToolCallData } from '@/components/chat/ChatToolCard';
import { buildToolDisplayBlocks, type ToolDisplayBlock } from '@/lib/chat/groupToolCalls';
import type { ToolLabelT } from '@/lib/chat/toolCatalog';

/** One ordered piece of an assistant turn: prose, or the tools run at that point. */
export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'tools'; blocks: ToolDisplayBlock[] };

/**
 * Rebuild an assistant turn in the order it happened.
 *
 * The transcript stores prose as one accumulated string and tool calls as a
 * separate array, so the view used to render every tool above the whole reply —
 * "voy a crear la rama" appeared *after* the branch was created. Each call
 * carries the text offset at which it was issued (`contentOffset`), which is
 * enough to slice the prose back around the cards.
 *
 * Messages restored from storage have no offsets; they degrade to the previous
 * behaviour (all tools, then the text) rather than inventing an order.
 */
export function interleaveMessageParts(
  content: string,
  toolCalls: ToolCallData[] | undefined,
  t: ToolLabelT,
): MessagePart[] {
  const calls = toolCalls ?? [];
  const text = content ?? '';

  if (calls.length === 0) {
    return text.trim() ? [{ type: 'text', text }] : [];
  }

  const positioned = calls.filter((c) => typeof c.contentOffset === 'number');
  if (positioned.length === 0) {
    const blocks = buildToolDisplayBlocks(calls, t);
    const parts: MessagePart[] = [];
    if (blocks.length > 0) parts.push({ type: 'tools', blocks });
    if (text.trim()) parts.push({ type: 'text', text });
    return parts;
  }

  // Calls issued at the same point in the prose belong to one card group.
  const byOffset = new Map<number, ToolCallData[]>();
  for (const call of calls) {
    const offset = Math.min(Math.max(call.contentOffset ?? 0, 0), text.length);
    const bucket = byOffset.get(offset) ?? [];
    bucket.push(call);
    byOffset.set(offset, bucket);
  }

  const parts: MessagePart[] = [];
  let cursor = 0;
  for (const offset of [...byOffset.keys()].sort((a, b) => a - b)) {
    const slice = text.slice(cursor, offset);
    if (slice.trim()) parts.push({ type: 'text', text: slice });
    cursor = Math.max(cursor, offset);

    const blocks = buildToolDisplayBlocks(byOffset.get(offset)!, t);
    if (blocks.length > 0) parts.push({ type: 'tools', blocks });
  }

  const tail = text.slice(cursor);
  if (tail.trim()) parts.push({ type: 'text', text: tail });

  return parts;
}
