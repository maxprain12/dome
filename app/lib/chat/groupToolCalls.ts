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

type FlatToolBlock =
  | { type: 'tool'; call: ToolCallData }
  | { type: 'tool-group'; name: string; calls: ToolCallData[] };

/**
 * Collapse *consecutive* runs of the same tool, preserving execution order.
 *
 * Grouping every call by name regardless of position reordered the transcript:
 * sixteen reads interleaved with git and search calls collapsed into one block
 * at the position of the first read, so the timeline no longer showed what the
 * agent actually did, in what order. Only a real chain — the same tool called
 * back to back — is compacted.
 */
function groupConsecutiveCalls(calls: ToolCallData[]): FlatToolBlock[] {
  if (!calls.length) return [];

  const blocks: FlatToolBlock[] = [];
  let i = 0;
  while (i < calls.length) {
    const name = calls[i]!.name;
    const run: ToolCallData[] = [];
    while (i < calls.length && calls[i]!.name === name) {
      run.push(calls[i]!);
      i += 1;
    }
    // A todo list is a single evolving artifact: only the latest state matters.
    if (name === 'write_todos') {
      blocks.push({ type: 'tool', call: run[run.length - 1]! });
    } else if (run.length === 1) {
      blocks.push({ type: 'tool', call: run[0]! });
    } else {
      blocks.push({ type: 'tool-group', name, calls: run });
    }
  }
  return blocks;
}

/**
 * Organize tool calls for chat UI: supervisor tools first, nested subagent sections
 * compacting consecutive runs of the same tool while keeping execution order.
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
        blocks: groupConsecutiveCalls(agentCalls),
      });
    } else {
      const supervisorCalls: ToolCallData[] = [];
      while (i < coalesced.length && !(coalesced[i]?.agentName || '').trim()) {
        supervisorCalls.push(coalesced[i]!);
        i += 1;
      }
      blocks.push(...groupConsecutiveCalls(supervisorCalls));
    }
  }

  return blocks;
}
