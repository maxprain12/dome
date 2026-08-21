import { describe, expect, it } from 'vitest';
import { buildToolDisplayBlocks } from './groupToolCalls';
import type { ToolCallData } from '@/components/chat/ChatToolCard';

const t = ((key: string) => key) as never;

let seq = 0;
function call(name: string, extra: Partial<ToolCallData> = {}): ToolCallData {
  seq += 1;
  return {
    id: `c${seq}`,
    name,
    arguments: { n: seq },
    status: 'success',
    ...extra,
  } as ToolCallData;
}

describe('buildToolDisplayBlocks', () => {
  it('returns nothing for an empty list', () => {
    expect(buildToolDisplayBlocks([], t)).toEqual([]);
  });

  it('compacts a chain of the same tool into one group', () => {
    const blocks = buildToolDisplayBlocks(
      [call('file_read'), call('file_read'), call('file_read')],
      t,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: 'tool-group', name: 'file_read' });
    expect((blocks[0] as { calls: unknown[] }).calls).toHaveLength(3);
  });

  it('keeps execution order when the same tool appears in separate chains', () => {
    // Regression: grouping by name alone hoisted every read into one block at
    // the position of the first, so the transcript no longer matched reality.
    const blocks = buildToolDisplayBlocks(
      [
        call('file_read'),
        call('file_read'),
        call('git_status'),
        call('file_read'),
        call('file_read'),
      ],
      t,
    );
    expect(blocks.map((b) => (b.type === 'tool' ? b.call.name : b.type === 'tool-group' ? b.name : b.agentKey))).toEqual([
      'file_read',
      'git_status',
      'file_read',
    ]);
    expect(blocks[0]).toMatchObject({ type: 'tool-group' });
    expect(blocks[1]).toMatchObject({ type: 'tool' });
    expect(blocks[2]).toMatchObject({ type: 'tool-group' });
  });

  it('leaves a lone call as a single card', () => {
    const blocks = buildToolDisplayBlocks([call('git_status')], t);
    expect(blocks[0]).toMatchObject({ type: 'tool' });
  });

  it('shows only the latest state of a todo list', () => {
    const blocks = buildToolDisplayBlocks(
      [call('write_todos'), call('write_todos'), call('write_todos')],
      t,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: 'tool' });
  });

  it('nests subagent work in its own section', () => {
    const blocks = buildToolDisplayBlocks(
      [
        call('git_status'),
        call('file_read', { agentName: 'coding' }),
        call('file_read', { agentName: 'coding' }),
        call('git_commit'),
      ],
      t,
    );
    expect(blocks.map((b) => b.type)).toEqual(['tool', 'subagent', 'tool']);
    const sub = blocks[1] as { blocks: Array<{ type: string }> };
    expect(sub.blocks).toHaveLength(1);
    expect(sub.blocks[0]).toMatchObject({ type: 'tool-group' });
  });
});
