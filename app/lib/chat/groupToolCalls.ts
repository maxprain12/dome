import type { ToolCallData } from '@/components/chat/ChatToolCard';
import { coalesceDuplicateToolCalls } from '@/lib/chat/coalesceToolCalls';
import { getSubagentDisplayLabel, type ToolLabelT } from '@/lib/chat/toolCatalog';

export type ToolDisplayBlock =
  | { type: 'tool'; call: ToolCallData }
  | { type: 'tool-group'; name: string; calls: ToolCallData[] }
  | {
      type: 'subagent';
      agentKey: string;
      agentLabel: string;
      blocks: Array<{ type: 'tool'; call: ToolCallData } | { type: 'tool-group'; name: string; calls: ToolCallData[] }>;
    };

function groupCallsByName(calls: ToolCallData[]): Array<{ type: 'tool'; call: ToolCallData } | { type: 'tool-group'; name: string; calls: ToolCallData[] }> {
  if (!calls.length) return [];
  const grouped = new Map<string, ToolCallData[]>();
  for (const tc of calls) {
    const arr = grouped.get(tc.name) ?? [];
    arr.push(tc);
    grouped.set(tc.name, arr);
  }
  return Array.from(grouped.entries()).map(([name, items]) => {
    if (name === 'write_todos' && items.length > 1) {
      return { type: 'tool' as const, call: items[items.length - 1]! };
    }
    if (items.length === 1) return { type: 'tool' as const, call: items[0]! };
    return { type: 'tool-group' as const, name, calls: items };
  });
}

/**
 * Organize tool calls for chat UI: supervisor tools first, nested subagent sections
 * with grouped duplicates (e.g. 12× file_write under "Investigación").
 */
export function buildToolDisplayBlocks(calls: ToolCallData[], t: ToolLabelT): ToolDisplayBlock[] {
  const coalesced = coalesceDuplicateToolCalls(calls ?? []);
  if (!coalesced.length) return [];

  const blocks: ToolDisplayBlock[] = [];
  let i = 0;

  while (i < coalesced.length) {
    const call = coalesced[i]!;
    const agentKey = (call.agentName || '').trim();

    if (agentKey) {
      const agentCalls: ToolCallData[] = [];
      while (i < coalesced.length && (coalesced[i]?.agentName || '').trim() === agentKey) {
        agentCalls.push(coalesced[i]!);
        i += 1;
      }
      blocks.push({
        type: 'subagent',
        agentKey,
        agentLabel: getSubagentDisplayLabel(agentKey, t),
        blocks: groupCallsByName(agentCalls),
      });
    } else {
      const supervisorCalls: ToolCallData[] = [];
      while (i < coalesced.length && !(coalesced[i]?.agentName || '').trim()) {
        supervisorCalls.push(coalesced[i]!);
        i += 1;
      }
      blocks.push(...groupCallsByName(supervisorCalls));
    }
  }

  return blocks;
}
