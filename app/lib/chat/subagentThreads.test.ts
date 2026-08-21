import { describe, expect, it } from 'vitest';
import { parseSubagentThreadId } from './subagentThreads';

const PARENT = 'session_abc-123';

describe('parseSubagentThreadId', () => {
  it('reads the agent and start time out of a nested session id', () => {
    const parsed = parseSubagentThreadId(PARENT, `${PARENT}_sub_coding_1784995178870`);
    expect(parsed).toEqual({
      threadId: `${PARENT}_sub_coding_1784995178870`,
      agentKey: 'coding',
      startedAt: 1784995178870,
    });
  });

  it('ignores the parent session itself', () => {
    expect(parseSubagentThreadId(PARENT, PARENT)).toBeNull();
  });

  it('ignores a session belonging to another conversation', () => {
    expect(parseSubagentThreadId(PARENT, 'session_other_sub_coding_1')).toBeNull();
  });

  it('ignores sibling nesting kinds (fork, member)', () => {
    expect(parseSubagentThreadId(PARENT, `${PARENT}_fork_1`)).toBeNull();
    expect(parseSubagentThreadId(PARENT, `${PARENT}_member_x_1`)).toBeNull();
  });

  it('ignores a malformed suffix instead of guessing', () => {
    expect(parseSubagentThreadId(PARENT, `${PARENT}_sub_coding`)).toBeNull();
    expect(parseSubagentThreadId(PARENT, `${PARENT}_sub__123`)).toBeNull();
  });

  it('accepts a hyphenated agent key', () => {
    const parsed = parseSubagentThreadId(PARENT, `${PARENT}_sub_deep-research_5`);
    expect(parsed?.agentKey).toBe('deep-research');
  });

  it('handles an empty parent id', () => {
    expect(parseSubagentThreadId('', '_sub_coding_1')).toBeNull();
  });
});
