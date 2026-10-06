import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { completeSimple, streamSimple } from '@dome/ai';
import type { AssistantMessage, Model } from '@dome/ai';
import { AgentHarness } from '../src/harness/agent-harness.js';
import { NodeExecutionEnv } from '../src/harness/env/nodejs.js';
import { InMemorySessionRepo } from '../src/harness/session/memory-repo.js';
import { JsonlSessionRepo } from '../src/harness/session/jsonl-repo.js';
import type { Session } from '../src/harness/types.js';

vi.mock('@dome/ai', async (original) => ({
  ...await original<typeof import('@dome/ai')>(),
  completeSimple: vi.fn(),
  streamSimple: vi.fn(),
}));

const model = { id: 'test', provider: 'test', api: 'openai-completions',
  contextWindow: 100_000, maxTokens: 16_000, reasoning: false } as Model<any>;
const env = new NodeExecutionEnv({ cwd: tmpdir() });
const roots: string[] = [];

function reply(text = 'answer', tokens = 100): AssistantMessage {
  return { role: 'assistant', content: [{ type: 'text', text }],
    api: model.api, provider: model.provider, model: model.id,
    stopReason: 'stop', timestamp: Date.now(), usage: {
      input: tokens, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: tokens,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    } };
}

async function seed(session: Session) {
  await session.appendMessage({ role: 'user', content: 'old history '.repeat(40_000), timestamp: 1 });
  await session.appendMessage(reply('old answer', 90_000));
  await session.appendMessage({ role: 'user', content: 'Keep this request '.repeat(5_000), timestamp: 2 });
}

function harness(session: Session, autoCompaction = true) {
  return new AgentHarness({ env, session, model, autoCompaction,
    getApiKeyAndHeaders: async () => ({ apiKey: 'fresh-token', headers: { 'x-provider': 'fresh-header' } }),
  });
}

beforeEach(() => {
  vi.mocked(completeSimple).mockReset().mockResolvedValue(reply('durable summary'));
  vi.mocked(streamSimple).mockReset().mockImplementation(() => {
    const message = reply();
    return {
      async *[Symbol.asyncIterator]() { yield { type: 'start', partial: message }; yield { type: 'done', message }; },
      result: async () => message,
    } as ReturnType<typeof streamSimple>;
  });
});

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('durable harness compaction', () => {
  it('saves one checkpoint and reuses it after reopening JSONL in a new harness', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dome-compaction-test-'));
    roots.push(root);
    const repo = new JsonlSessionRepo({ fs: env, sessionsRoot: root });
    const session = await repo.create({ cwd: root });
    await seed(session);
    const agent = harness(session);
    const events: unknown[] = [];
    agent.subscribe((event) => { if (event.type === 'session_compact') events.push(event); });
    await agent.prompt('Continue');
    expect(completeSimple).toHaveBeenCalledTimes(1);
    expect(vi.mocked(completeSimple).mock.calls[0][2]).toMatchObject({
      apiKey: 'fresh-token', headers: { 'x-provider': 'fresh-header' }, signal: expect.any(AbortSignal),
    });
    expect(events).toEqual([expect.objectContaining({ automatic: true })]);
    const sent = vi.mocked(streamSimple).mock.calls[0][1].messages;
    expect(JSON.stringify(sent)).toContain('durable summary');
    expect(JSON.stringify(sent)).not.toContain('old history');
    expect(JSON.stringify(sent)).toContain('Keep this request');
    const reopened = await new JsonlSessionRepo({ fs: env, sessionsRoot: root }).open(await session.getMetadata());
    await harness(reopened).prompt('Next question');
    expect(completeSimple).toHaveBeenCalledTimes(1);
    expect((await reopened.getBranch()).filter((entry) => entry.type === 'compaction')).toHaveLength(1);
    expect(JSON.stringify(vi.mocked(streamSimple).mock.calls[1][1].messages)).not.toContain('old history');
  });

  it('keeps retained tool results with their assistant tool calls', async () => {
    const session = await new InMemorySessionRepo().create();
    await seed(session);
    await session.appendMessage({ ...reply('', 90_000), stopReason: 'toolUse',
      content: [{ type: 'toolCall', id: 'read-1', name: 'read', arguments: { path: 'notes.md' } }] });
    await session.appendMessage({ role: 'toolResult', toolCallId: 'read-1', toolName: 'read',
      content: [{ type: 'text', text: 'file content '.repeat(1_000) }], isError: false, timestamp: 3 });
    await harness(session).prompt('Continue');
    const sent = vi.mocked(streamSimple).mock.calls[0][1].messages;
    const results = sent.filter((message) => message.role === 'toolResult');
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(sent.some((message) => message.role === 'assistant' && message.content.some(
        (block) => block.type === 'toolCall' && block.id === result.toolCallId))).toBe(true);
    }
  });

  it.each([false, true])('abort cancels the summarizer and saves no checkpoint (automatic=%s)', async (automatic) => {
    const session = await new InMemorySessionRepo().create();
    await seed(session);
    const agent = harness(session);
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    vi.mocked(completeSimple).mockImplementation(async (_model, _context, options) => {
      started();
      await new Promise<void>((resolve) => options!.signal!.addEventListener('abort', () => resolve(), { once: true }));
      return { ...reply(), stopReason: 'aborted' };
    });
    const run = automatic ? agent.prompt('Continue') : agent.compact();
    const outcome = run.then((value) => value, (error: unknown) => error);
    await ready;
    await agent.abort();
    const result = await outcome;
    if (automatic) expect(result).toMatchObject({ stopReason: 'aborted' });
    else expect(result).toBeInstanceOf(Error);
    expect((await session.getBranch()).some((entry) => entry.type === 'compaction')).toBe(false);
    expect(streamSimple).not.toHaveBeenCalled();
  });

  it('leaves history intact and proceeds when automatic summarization fails', async () => {
    const session = await new InMemorySessionRepo().create();
    await seed(session);
    vi.mocked(completeSimple).mockResolvedValue({ ...reply(), stopReason: 'error', errorMessage: 'unavailable' });
    expect((await harness(session).prompt('Continue')).stopReason).toBe('stop');
    expect((await session.getBranch()).some((entry) => entry.type === 'compaction')).toBe(false);
    expect(JSON.stringify(vi.mocked(streamSimple).mock.calls[0][1].messages)).toContain('old history');
  });

  it('does not summarize a short conversation or an opt-out session', async () => {
    const small = await new InMemorySessionRepo().create();
    await harness(small).prompt('Hello');
    const large = await new InMemorySessionRepo().create();
    await seed(large);
    await harness(large, false).prompt('Continue');
    expect(completeSimple).not.toHaveBeenCalled();
  });

  it('manual compaction uses the same persisted checkpoint', async () => {
    const session = await new InMemorySessionRepo().create();
    await seed(session);
    const agent = harness(session);
    await agent.compact('Preserve decisions');
    expect((await session.buildContext()).messages[0]).toMatchObject({ role: 'compactionSummary' });
    expect(JSON.stringify(vi.mocked(completeSimple).mock.calls[0][1]).includes('Preserve decisions')).toBe(true);
    expect((await session.getBranch()).filter((entry) => entry.type === 'compaction')).toHaveLength(1);
  });

  it('keeps the summary model and its auth together when the model changes during preparation', async () => {
    const session = await new InMemorySessionRepo().create();
    await seed(session);
    const getApiKeyAndHeaders = vi.fn(async () => ({ apiKey: 'original-model-key' }));
    const agent = new AgentHarness({ env, session, model, getApiKeyAndHeaders });
    agent.on('session_before_compact', async () => {
      await agent.setModel({ ...model, id: 'next-model' });
    });
    await agent.compact();
    expect(getApiKeyAndHeaders).toHaveBeenCalledWith(model);
    expect(vi.mocked(completeSimple).mock.calls[0][0]).toBe(model);
    expect(vi.mocked(completeSimple).mock.calls[0][2]).toMatchObject({ apiKey: 'original-model-key' });
  });

  it('retries a transient summarizer failure instead of giving up', async () => {
    const session = await new InMemorySessionRepo().create();
    await seed(session);
    vi.mocked(completeSimple)
      .mockResolvedValueOnce({ ...reply(''), stopReason: 'error', errorMessage: '503 service unavailable' })
      .mockResolvedValue(reply('durable summary'));
    await harness(session).prompt('Continue');
    expect(completeSimple).toHaveBeenCalledTimes(2);
    expect((await session.getBranch()).filter((entry) => entry.type === 'compaction')).toHaveLength(1);
  });

  it('refuses to store a summary that was cut off at the output limit', async () => {
    const session = await new InMemorySessionRepo().create();
    await seed(session);
    vi.mocked(completeSimple).mockResolvedValue({ ...reply('half a summ'), stopReason: 'length' });
    await expect(harness(session).compact()).rejects.toThrow(/cut off/);
    expect((await session.getBranch()).filter((entry) => entry.type === 'compaction')).toHaveLength(0);
  });

  it('refuses a summary that is only a tool call', async () => {
    const session = await new InMemorySessionRepo().create();
    await seed(session);
    vi.mocked(completeSimple).mockResolvedValue({ ...reply(''), content: [{ type: 'toolCall', id: 'x', name: 'read', arguments: {} }] });
    await expect(harness(session).compact()).rejects.toThrow(/tool call/);
  });

  it('compacts and retries once when the provider rejects the request as too large', async () => {
    const session = await new InMemorySessionRepo().create();
    await seed(session);
    let call = 0;
    vi.mocked(streamSimple).mockImplementation(() => {
      call += 1;
      if (call === 1) {
        const failed = { ...reply(''), content: [], stopReason: 'error', errorMessage: 'prompt is too long: 250000 tokens > 200000 maximum' } as AssistantMessage;
        return {
          async *[Symbol.asyncIterator]() { yield { type: 'start', partial: failed }; yield { type: 'error', reason: 'error', error: failed }; },
          result: async () => failed,
        } as ReturnType<typeof streamSimple>;
      }
      const message = reply('after recovery', 200);
      return {
        async *[Symbol.asyncIterator]() { yield { type: 'start', partial: message }; yield { type: 'done', message }; },
        result: async () => message,
      } as ReturnType<typeof streamSimple>;
    });
    // Small enough that proactive compaction does not fire, so only the provider's rejection triggers it.
    vi.mocked(completeSimple).mockResolvedValue(reply('durable summary'));
    const agent = new AgentHarness({ env, session, model: { ...model, contextWindow: 10_000_000 }, autoCompaction: true });
    const result = await agent.prompt('Continue');
    expect(call).toBe(2);
    expect(JSON.stringify(result.content)).toContain('after recovery');
    const sent = vi.mocked(streamSimple).mock.calls[1][1].messages;
    expect(JSON.stringify(sent)).toContain('durable summary');
    expect(JSON.stringify(sent)).not.toContain('old history');
  });

  it('compacts at a host-chosen token budget well below the model window', async () => {
    const fresh = async () => {
      const session = await new InMemorySessionRepo().create();
      await session.appendMessage({ role: 'user', content: 'older note '.repeat(900), timestamp: 1 });
      await session.appendMessage(reply('older answer', 3_000));
      await session.appendMessage({ role: 'user', content: 'newer note '.repeat(900), timestamp: 2 });
      await session.appendMessage(reply('newer answer', 6_000));
      return session;
    };
    await new AgentHarness({ env, session: await fresh(), model, autoCompaction: true, compaction: { thresholdTokens: 50_000, keepRecentTokens: 2_000 } }).prompt('Continue');
    expect(completeSimple).not.toHaveBeenCalled();
    const session = await fresh();
    await new AgentHarness({ env, session, model, autoCompaction: true, compaction: { thresholdTokens: 4_000, keepRecentTokens: 2_000 } }).prompt('Continue');
    expect(completeSimple).toHaveBeenCalledTimes(1);
    expect((await session.getBranch()).filter((entry) => entry.type === 'compaction')).toHaveLength(1);
  });
});

describe('system prompt and tools in the transcript', () => {
  const tool = (name: string) => ({
    name, label: name, description: `${name} tool`, parameters: { type: 'object', properties: {}, additionalProperties: false } as never,
    execute: async () => ({ content: [{ type: 'text' as const, text: 'ok' }], details: {} }),
  });
  const withTranscript = (session: Session, extra: Record<string, unknown> = {}) => new AgentHarness({
    env, session, model, transcriptSystem: true, systemPrompt: 'You are exact.', tools: [tool('alpha')], ...extra,
  });

  it('starts a session with the prompt and the tools as a system message, and does not repeat it', async () => {
    const session = await new InMemorySessionRepo().create();
    await withTranscript(session).prompt('First');
    await withTranscript(session).prompt('Second');
    const system = (await session.buildContext()).messages.filter((message) => message.role === 'system');
    expect(system).toHaveLength(1);
    expect(JSON.stringify(system[0])).toContain('You are exact.');
    const sent = vi.mocked(streamSimple).mock.calls[1][1].messages;
    expect(sent[0].role).toBe('system');
    expect(sent.filter((message) => message.role === 'system')).toHaveLength(1);
    expect(JSON.stringify(sent[0])).toContain('alpha');
  });

  it('declares a changed tool set as a delta instead of rewriting the prompt', async () => {
    const session = await new InMemorySessionRepo().create();
    const agent = withTranscript(session, { tools: [tool('alpha'), tool('beta')], activeToolNames: ['alpha'] });
    await agent.prompt('First');
    await agent.setActiveTools(['alpha', 'beta']);
    await agent.prompt('Second');
    const system = (await session.buildContext()).messages.filter((message) => message.role === 'system');
    expect(system).toHaveLength(2);
    expect(JSON.stringify(system[1])).toContain('beta');
    expect(JSON.stringify(system[1])).not.toContain('You are exact.');
  });

  it('leaves a session that began without a system message the way it was', async () => {
    const session = await new InMemorySessionRepo().create();
    await session.appendMessage({ role: 'user', content: 'older', timestamp: 1 });
    await session.appendMessage(reply('older answer'));
    await withTranscript(session).prompt('Next');
    expect((await session.buildContext()).messages.some((message) => message.role === 'system')).toBe(false);
    const sent = vi.mocked(streamSimple).mock.calls[0][1].messages;
    expect(sent[0].role).toBe('system');
    expect(JSON.stringify(sent[0])).toContain('You are exact.');
  });

  it('puts the system messages back in front after a compaction replaced the old turns', async () => {
    const session = await new InMemorySessionRepo().create();
    await withTranscript(session).prompt('Seed');
    await session.appendMessage({ role: 'user', content: 'old history '.repeat(40_000), timestamp: 10 });
    await session.appendMessage(reply('old answer', 90_000));
    await session.appendMessage({ role: 'user', content: 'Keep this request '.repeat(5_000), timestamp: 20 });
    await withTranscript(session, { autoCompaction: true }).prompt('Continue');
    expect(completeSimple).toHaveBeenCalled();
    const sent = vi.mocked(streamSimple).mock.calls.at(-1)![1].messages;
    expect(sent[0].role).toBe('system');
    expect(JSON.stringify(sent[0])).toContain('You are exact.');
    expect(JSON.stringify(sent)).toContain('durable summary');
    expect(JSON.stringify(sent)).not.toContain('old history');
  });

  it('keeps the system messages for every later turn of a session that was compacted', async () => {
    const session = await new InMemorySessionRepo().create();
    await withTranscript(session).prompt('Seed');
    await session.appendMessage({ role: 'user', content: 'old history '.repeat(40_000), timestamp: 10 });
    await session.appendMessage(reply('old answer', 90_000));
    await session.appendMessage({ role: 'user', content: 'Keep this request '.repeat(5_000), timestamp: 20 });
    await withTranscript(session, { autoCompaction: true }).prompt('Continue');
    // A fresh harness over the compacted session (a resumed task): the prompt and tools are still there.
    await withTranscript(session).prompt('And again');
    const sent = vi.mocked(streamSimple).mock.calls.at(-1)![1].messages;
    expect(sent[0].role).toBe('system');
    expect(sent.filter((message) => message.role === 'system')).toHaveLength(1);
    expect(JSON.stringify(sent[0])).toContain('alpha');
  });
});
