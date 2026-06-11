import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMPACTION_SETTINGS,
  calculateContextTokens,
  estimateContextTokens,
  estimateTokens,
  shouldCompact,
} from '../src/harness/compaction/compaction.js';
import type { AgentMessage } from '../src/types.js';

const user = (text: string): AgentMessage =>
  ({ role: 'user', content: text, timestamp: Date.now() }) as any;

function assistantWithUsage(totalTokens: number, stopReason = 'stopped'): AgentMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text: 'reply' }],
    stopReason,
    timestamp: Date.now(),
    usage: {
      input: totalTokens / 2,
      output: totalTokens / 2,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  } as any;
}

describe('shouldCompact', () => {
  it('does not compact while under the reserve threshold', () => {
    expect(shouldCompact(10_000, 100_000, DEFAULT_COMPACTION_SETTINGS)).toBe(false);
  });

  it('compacts when tokens exceed window minus reserve', () => {
    const threshold = 100_000 - DEFAULT_COMPACTION_SETTINGS.reserveTokens;
    expect(shouldCompact(threshold + 1, 100_000, DEFAULT_COMPACTION_SETTINGS)).toBe(true);
  });

  it('never compacts when disabled', () => {
    expect(
      shouldCompact(999_999, 100_000, { ...DEFAULT_COMPACTION_SETTINGS, enabled: false }),
    ).toBe(false);
  });
});

describe('estimateContextTokens', () => {
  it('falls back to character-based estimation without assistant usage', () => {
    const messages = [user('x'.repeat(400))];
    const estimate = estimateContextTokens(messages);
    expect(estimate.lastUsageIndex).toBeNull();
    expect(estimate.tokens).toBe(100); // 400 chars / 4
  });

  it('anchors on the last successful assistant usage plus trailing estimate', () => {
    const messages = [user('question'), assistantWithUsage(5000), user('y'.repeat(400))];
    const estimate = estimateContextTokens(messages);
    expect(estimate.lastUsageIndex).toBe(1);
    expect(estimate.usageTokens).toBe(5000);
    expect(estimate.trailingTokens).toBe(100);
    expect(estimate.tokens).toBe(5100);
  });

  it('ignores usage from errored or aborted assistant messages', () => {
    const messages = [user('q'), assistantWithUsage(5000, 'error')];
    const estimate = estimateContextTokens(messages);
    expect(estimate.lastUsageIndex).toBeNull();
  });
});

describe('token estimation primitives', () => {
  it('calculateContextTokens prefers totalTokens and sums otherwise', () => {
    expect(
      calculateContextTokens({
        input: 1,
        output: 2,
        cacheRead: 3,
        cacheWrite: 4,
        totalTokens: 42,
      } as any),
    ).toBe(42);
    expect(
      calculateContextTokens({
        input: 1,
        output: 2,
        cacheRead: 3,
        cacheWrite: 4,
        totalTokens: 0,
      } as any),
    ).toBe(10);
  });

  it('estimateTokens uses a chars/4 heuristic for user messages', () => {
    expect(estimateTokens(user('x'.repeat(80)))).toBe(20);
  });
});
