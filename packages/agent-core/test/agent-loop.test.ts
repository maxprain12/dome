import { describe, expect, it } from 'vitest';
import { runAgentLoop, runAgentLoopContinue, agentLoopContinue } from '../src/agent-loop.js';
import type { AgentContext, AgentEvent, AgentLoopConfig, AgentMessage } from '../src/types.js';

/* ------------------------------------------------------------------ */
/* Test doubles                                                        */
/* ------------------------------------------------------------------ */

type AnyAssistant = any;

function assistantText(text: string, stopReason = 'stopped'): AnyAssistant {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    stopReason,
    timestamp: Date.now(),
    api: 'test',
    provider: 'test',
    model: 'mock-model',
    usage: {
      input: 10,
      output: 10,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 20,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
}

function assistantToolCall(
  calls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
): AnyAssistant {
  return {
    ...assistantText(''),
    content: calls.map((c) => ({ type: 'toolCall', ...c })),
    stopReason: 'toolUse',
  };
}

/** Minimal AssistantMessageEventStream double: async-iterable + result(). */
class MockStream {
  constructor(private readonly message: AnyAssistant) {}
  async *[Symbol.asyncIterator]() {
    yield { type: 'start', partial: { ...this.message } };
    yield { type: 'done' };
  }
  async result() {
    return this.message;
  }
}

/** streamFn that pops scripted assistant messages in order. */
function scriptedStreamFn(script: AnyAssistant[]) {
  let i = 0;
  const calls: number[] = [];
  const fn = (() => {
    calls.push(i);
    const msg = script[i] ?? assistantText('(script exhausted)');
    i += 1;
    return new MockStream(msg);
  }) as any;
  fn.callCount = () => calls.length;
  return fn;
}

function echoTool(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: 'echo',
    description: 'Echo back the input',
    parameters: {
      type: 'object',
      properties: { value: { type: 'string' } },
      required: ['value'],
    },
    execute: async (_id: string, args: { value: string }) => ({
      content: [{ type: 'text', text: `echo:${args.value}` }],
      details: {},
    }),
    ...overrides,
  } as any;
}

function makeContext(tools: any[] = []): AgentContext {
  return { systemPrompt: 'You are a test agent.', messages: [], tools } as any;
}

function makeConfig(streamFn: any, overrides: Partial<AgentLoopConfig> = {}): AgentLoopConfig {
  return {
    model: { provider: 'test', id: 'mock-model', contextWindow: 100000 } as any,
    convertToLlm: (messages: AgentMessage[]) => messages as any,
    ...overrides,
  } as AgentLoopConfig;
}

async function run(
  prompts: AgentMessage[],
  context: AgentContext,
  config: AgentLoopConfig,
  streamFn: any,
  signal?: AbortSignal,
) {
  const events: AgentEvent[] = [];
  const messages = await runAgentLoop(prompts, context, config, (e) => void events.push(e), signal, streamFn);
  return { events, messages };
}

const userMsg = (text: string): AgentMessage =>
  ({ role: 'user', content: text, timestamp: Date.now() }) as any;

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe('agent loop: basic turns', () => {
  it('completes a simple text turn and emits the full event sequence', async () => {
    const streamFn = scriptedStreamFn([assistantText('hello')]);
    const { events, messages } = await run([userMsg('hi')], makeContext(), makeConfig(streamFn), streamFn);

    const types = events.map((e) => e.type);
    expect(types[0]).toBe('agent_start');
    expect(types).toContain('turn_start');
    expect(types).toContain('turn_end');
    expect(types[types.length - 1]).toBe('agent_end');

    expect(messages).toHaveLength(2); // prompt + assistant
    expect((messages[1] as AnyAssistant).content[0].text).toBe('hello');
  });

  it('ends immediately when the model reports stopReason=error', async () => {
    const streamFn = scriptedStreamFn([assistantText('boom', 'error')]);
    const { events } = await run([userMsg('hi')], makeContext(), makeConfig(streamFn), streamFn);
    expect(events.map((e) => e.type)).not.toContain('tool_execution_start');
    expect(events[events.length - 1].type).toBe('agent_end');
    expect(streamFn.callCount()).toBe(1);
  });

  it('ends immediately when the model reports stopReason=aborted', async () => {
    const streamFn = scriptedStreamFn([assistantText('', 'aborted')]);
    const { events } = await run([userMsg('hi')], makeContext(), makeConfig(streamFn), streamFn);
    expect(events[events.length - 1].type).toBe('agent_end');
    expect(streamFn.callCount()).toBe(1);
  });
});

describe('agent loop: tool execution', () => {
  it('executes a tool call and feeds the result back to the model', async () => {
    const streamFn = scriptedStreamFn([
      assistantToolCall([{ id: 't1', name: 'echo', arguments: { value: 'abc' } }]),
      assistantText('done'),
    ]);
    const { events, messages } = await run(
      [userMsg('use echo')],
      makeContext([echoTool()]),
      makeConfig(streamFn),
      streamFn,
    );

    const toolResult = messages.find((m) => (m as any).role === 'toolResult') as any;
    expect(toolResult).toBeDefined();
    expect(toolResult.isError).toBe(false);
    expect(toolResult.content[0].text).toBe('echo:abc');
    expect(toolResult.toolCallId).toBe('t1');
    expect(streamFn.callCount()).toBe(2);
    expect(events.map((e) => e.type)).toContain('tool_execution_end');
  });

  it('executes multiple parallel tool calls and preserves source order of results', async () => {
    const streamFn = scriptedStreamFn([
      assistantToolCall([
        { id: 'a', name: 'echo', arguments: { value: '1' } },
        { id: 'b', name: 'echo', arguments: { value: '2' } },
      ]),
      assistantText('done'),
    ]);
    const { messages } = await run([userMsg('go')], makeContext([echoTool()]), makeConfig(streamFn), streamFn);
    const results = messages.filter((m) => (m as any).role === 'toolResult') as any[];
    expect(results.map((r) => r.toolCallId)).toEqual(['a', 'b']);
    expect(results.map((r) => r.content[0].text)).toEqual(['echo:1', 'echo:2']);
  });

  it('returns an error tool result for unknown tools and keeps the loop alive', async () => {
    const streamFn = scriptedStreamFn([
      assistantToolCall([{ id: 't1', name: 'nope', arguments: {} }]),
      assistantText('recovered'),
    ]);
    const { messages } = await run([userMsg('go')], makeContext([echoTool()]), makeConfig(streamFn), streamFn);
    const result = messages.find((m) => (m as any).role === 'toolResult') as any;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found/);
    expect((messages[messages.length - 1] as any).content[0].text).toBe('recovered');
  });

  it('rejects invalid arguments with a validation error tool result', async () => {
    const streamFn = scriptedStreamFn([
      assistantToolCall([{ id: 't1', name: 'echo', arguments: {} }]), // missing required `value`
      assistantText('recovered'),
    ]);
    const { messages } = await run([userMsg('go')], makeContext([echoTool()]), makeConfig(streamFn), streamFn);
    const result = messages.find((m) => (m as any).role === 'toolResult') as any;
    expect(result.isError).toBe(true);
    expect(streamFn.callCount()).toBe(2); // the model gets a chance to recover
  });

  it('converts a throwing tool into an error tool result', async () => {
    const tool = echoTool({
      execute: async () => {
        throw new Error('tool exploded');
      },
    });
    const streamFn = scriptedStreamFn([
      assistantToolCall([{ id: 't1', name: 'echo', arguments: { value: 'x' } }]),
      assistantText('recovered'),
    ]);
    const { messages } = await run([userMsg('go')], makeContext([tool]), makeConfig(streamFn), streamFn);
    const result = messages.find((m) => (m as any).role === 'toolResult') as any;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/tool exploded/);
  });

  it('terminates the run when every tool result sets terminate=true', async () => {
    const tool = echoTool({
      execute: async () => ({ content: [{ type: 'text', text: 'final' }], details: {}, terminate: true }),
    });
    const streamFn = scriptedStreamFn([
      assistantToolCall([{ id: 't1', name: 'echo', arguments: { value: 'x' } }]),
      assistantText('should never be requested'),
    ]);
    const { messages } = await run([userMsg('go')], makeContext([tool]), makeConfig(streamFn), streamFn);
    expect(streamFn.callCount()).toBe(1); // no extra model turn after terminate
    expect((messages[messages.length - 1] as any).role).toBe('toolResult');
  });
});

describe('agent loop: hooks', () => {
  it('propagates interrupt-style errors from beforeToolCall out of the loop (HITL)', async () => {
    const interrupt = Object.assign(new Error('HITL interrupt'), { isAgentInterrupt: true });
    const streamFn = scriptedStreamFn([
      assistantToolCall([{ id: 't1', name: 'echo', arguments: { value: 'x' } }]),
      assistantText('should never be requested'),
    ]);
    const config = makeConfig(streamFn, {
      beforeToolCall: async () => {
        throw interrupt;
      },
    });
    await expect(
      runAgentLoop([userMsg('go')], makeContext([echoTool()]), config, () => {}, undefined, streamFn),
    ).rejects.toBe(interrupt);
    expect(streamFn.callCount()).toBe(1);
  });

  it('still converts plain errors from beforeToolCall into error tool results', async () => {
    const streamFn = scriptedStreamFn([
      assistantToolCall([{ id: 't1', name: 'echo', arguments: { value: 'x' } }]),
      assistantText('recovered'),
    ]);
    const config = makeConfig(streamFn, {
      beforeToolCall: async () => {
        throw new Error('plain hook failure');
      },
    });
    const { messages } = await run([userMsg('go')], makeContext([echoTool()]), config, streamFn);
    const result = messages.find((m) => (m as any).role === 'toolResult') as any;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/plain hook failure/);
  });

  it('beforeToolCall can block execution with a custom reason', async () => {
    let executed = false;
    const tool = echoTool({
      execute: async () => {
        executed = true;
        return { content: [{ type: 'text', text: 'ran' }], details: {} };
      },
    });
    const streamFn = scriptedStreamFn([
      assistantToolCall([{ id: 't1', name: 'echo', arguments: { value: 'x' } }]),
      assistantText('done'),
    ]);
    const config = makeConfig(streamFn, {
      beforeToolCall: async () => ({ block: true, reason: 'blocked by policy' }),
    });
    const { messages } = await run([userMsg('go')], makeContext([tool]), config, streamFn);
    const result = messages.find((m) => (m as any).role === 'toolResult') as any;
    expect(executed).toBe(false);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('blocked by policy');
  });

  it('afterToolCall can rewrite the tool result', async () => {
    const streamFn = scriptedStreamFn([
      assistantToolCall([{ id: 't1', name: 'echo', arguments: { value: 'x' } }]),
      assistantText('done'),
    ]);
    const config = makeConfig(streamFn, {
      afterToolCall: async () => ({ content: [{ type: 'text', text: 'rewritten' }] }),
    });
    const { messages } = await run([userMsg('go')], makeContext([echoTool()]), config, streamFn);
    const result = messages.find((m) => (m as any).role === 'toolResult') as any;
    expect(result.content[0].text).toBe('rewritten');
  });

  it('shouldStopAfterTurn stops the loop even when tool calls remain', async () => {
    const streamFn = scriptedStreamFn([
      assistantToolCall([{ id: 't1', name: 'echo', arguments: { value: 'x' } }]),
      assistantText('should never be requested'),
    ]);
    const config = makeConfig(streamFn, { shouldStopAfterTurn: async () => true });
    await run([userMsg('go')], makeContext([echoTool()]), config, streamFn);
    expect(streamFn.callCount()).toBe(1);
  });

  it('transformContext runs before each model call', async () => {
    const seen: number[] = [];
    const streamFn = scriptedStreamFn([assistantText('ok')]);
    const config = makeConfig(streamFn, {
      transformContext: async (messages) => {
        seen.push(messages.length);
        return messages;
      },
    });
    await run([userMsg('hi')], makeContext(), config, streamFn);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(1);
  });
});

describe('agent loop: steering and follow-up messages', () => {
  it('injects steering messages between turns', async () => {
    const steering = [userMsg('also do this')];
    let drained = false;
    const streamFn = scriptedStreamFn([
      assistantToolCall([{ id: 't1', name: 'echo', arguments: { value: 'x' } }]),
      assistantText('done'),
    ]);
    const config = makeConfig(streamFn, {
      getSteeringMessages: async () => {
        if (drained) return [];
        drained = true;
        return steering;
      },
    });
    const { messages } = await run([userMsg('go')], makeContext([echoTool()]), config, streamFn);
    const userMessages = messages.filter((m) => (m as any).role === 'user');
    expect(userMessages).toHaveLength(2);
  });

  it('continues with follow-up messages after the agent would stop', async () => {
    let delivered = false;
    const streamFn = scriptedStreamFn([assistantText('first'), assistantText('second')]);
    const config = makeConfig(streamFn, {
      getFollowUpMessages: async () => {
        if (delivered) return [];
        delivered = true;
        return [userMsg('one more thing')];
      },
    });
    const { messages } = await run([userMsg('go')], makeContext(), config, streamFn);
    expect(streamFn.callCount()).toBe(2);
    const assistants = messages.filter((m) => (m as any).role === 'assistant') as any[];
    expect(assistants.map((a) => a.content[0].text)).toEqual(['first', 'second']);
  });
});

describe('agent loop: continue mode', () => {
  it('throws when continuing with an empty context', () => {
    const streamFn = scriptedStreamFn([assistantText('x')]);
    expect(() => agentLoopContinue(makeContext(), makeConfig(streamFn), undefined, streamFn)).toThrow(
      /no messages/,
    );
  });

  it('throws when the last message is from the assistant', () => {
    const streamFn = scriptedStreamFn([assistantText('x')]);
    const ctx = makeContext();
    ctx.messages.push(assistantText('previous') as any);
    expect(() => agentLoopContinue(ctx, makeConfig(streamFn), undefined, streamFn)).toThrow(
      /assistant/,
    );
  });

  it('continues from an existing context without re-adding prompts', async () => {
    const streamFn = scriptedStreamFn([assistantText('continued')]);
    const ctx = makeContext();
    ctx.messages.push(userMsg('original question') as any);
    const events: AgentEvent[] = [];
    const messages = await runAgentLoopContinue(ctx, makeConfig(streamFn), (e) => void events.push(e), undefined, streamFn);
    expect(messages).toHaveLength(1); // only the new assistant message
    expect((messages[0] as any).content[0].text).toBe('continued');
    expect(ctx.messages).toHaveLength(2);
  });
});
