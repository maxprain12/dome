import { describe, expect, it } from 'vitest';
import { prepareBranchEntries } from '../src/harness/compaction/branch-summarization.js';
import type { SessionTreeEntry } from '../src/harness/types.js';
import type { AgentMessage } from '../src/types.js';

const ts = '2026-01-01T00:00:00.000Z';

function userEntry(id: string, text: string): SessionTreeEntry {
  return {
    type: 'message',
    id,
    parentId: null,
    timestamp: ts,
    message: { role: 'user', content: text, timestamp: 1 } as AgentMessage,
  };
}

function toolResultEntry(id: string): SessionTreeEntry {
  return {
    type: 'message',
    id,
    parentId: null,
    timestamp: ts,
    message: {
      role: 'toolResult',
      toolCallId: 't1',
      toolName: 'read',
      content: [{ type: 'text', text: 'ok' }],
      isError: false,
      timestamp: 1,
    } as AgentMessage,
  };
}

function assistantWithRead(id: string, path: string): SessionTreeEntry {
  return {
    type: 'message',
    id,
    parentId: null,
    timestamp: ts,
    message: {
      role: 'assistant',
      content: [{ type: 'toolCall', id: 'c1', name: 'read', arguments: { path } }],
      api: 'openai-completions',
      provider: 'openai',
      model: 'test',
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'toolUse',
      timestamp: 1,
    } as AgentMessage,
  };
}

function branchSummaryEntry(
  id: string,
  details: { readFiles?: string[]; modifiedFiles?: string[] } | undefined,
  fromHook = false,
): SessionTreeEntry {
  return {
    type: 'branch_summary',
    id,
    parentId: null,
    timestamp: ts,
    fromId: 'from-1',
    summary: 'prior branch',
    details,
    fromHook,
  };
}

function compactionEntry(id: string, summary: string): SessionTreeEntry {
  return {
    type: 'compaction',
    id,
    parentId: null,
    timestamp: ts,
    summary,
    firstKeptEntryId: 'kept',
    tokensBefore: 100,
  };
}

describe('prepareBranchEntries', () => {
  it('returns empty messages for an empty entry list', () => {
    const prepared = prepareBranchEntries([]);
    expect(prepared.messages).toEqual([]);
    expect(prepared.totalTokens).toBe(0);
    expect([...prepared.fileOps.read]).toEqual([]);
  });

  it('skips toolResult messages and label/meta entries', () => {
    const prepared = prepareBranchEntries([
      toolResultEntry('tr'),
      { type: 'label', id: 'l1', parentId: null, timestamp: ts, targetId: 'x', label: 'L' },
      userEntry('u1', 'hello'),
    ]);
    expect(prepared.messages).toHaveLength(1);
    expect(prepared.messages[0]?.role).toBe('user');
  });

  it('merges non-hook branch_summary details into fileOps and ignores fromHook', () => {
    const prepared = prepareBranchEntries([
      branchSummaryEntry('bs1', { readFiles: ['from-summary.ts'], modifiedFiles: ['edited.ts'] }),
      branchSummaryEntry('bs-hook', { readFiles: ['hook-only.ts'] }, true),
      assistantWithRead('a1', 'from-tool.ts'),
    ]);
    expect([...prepared.fileOps.read].sort((a, b) => a.localeCompare(b))).toEqual([
      'from-summary.ts',
      'from-tool.ts',
    ]);
    expect([...prepared.fileOps.edited]).toEqual(['edited.ts']);
  });

  it('keeps chronological order when tokenBudget is 0 (unlimited)', () => {
    const prepared = prepareBranchEntries(
      [userEntry('u1', 'aaa'), userEntry('u2', 'bbb'), userEntry('u3', 'ccc')],
      0,
    );
    expect(prepared.messages.map((m) => (m as { content: string }).content)).toEqual([
      'aaa',
      'bbb',
      'ccc',
    ]);
  });

  it('drops older messages once the token budget is exceeded', () => {
    // estimateTokens(user) = ceil(chars/4); "xxxx" => 1 token each
    const prepared = prepareBranchEntries(
      [userEntry('u1', 'xxxx'), userEntry('u2', 'xxxx'), userEntry('u3', 'xxxx')],
      2,
    );
    expect(prepared.messages).toHaveLength(2);
    expect(prepared.totalTokens).toBe(2);
  });

  it('keeps a pinned compaction summary when over budget but under 90% headroom', () => {
    // Newest user: 16 chars => 4 tokens. Budget 5 => after user, headroom 4 < 4.5.
    // Compaction summary length 40 => 10 tokens, exceeds remaining budget but is pinned.
    const prepared = prepareBranchEntries(
      [compactionEntry('c1', 'x'.repeat(40)), userEntry('u1', 'x'.repeat(16))],
      5,
    );
    expect(prepared.messages.some((m) => m.role === 'user')).toBe(true);
    expect(prepared.messages.some((m) => m.role === 'compactionSummary')).toBe(true);
  });

  it('does not keep a pinned summary when headroom is already at or above 90%', () => {
    // Newest user fills budget exactly (4 tokens, budget 4) => headroom 4 < 3.6 is false.
    const prepared = prepareBranchEntries(
      [compactionEntry('c1', 'x'.repeat(40)), userEntry('u1', 'x'.repeat(16))],
      4,
    );
    expect(prepared.messages).toHaveLength(1);
    expect(prepared.messages[0]?.role).toBe('user');
  });
});
