import { describe, expect, it } from 'vitest';
import { legacyMessagesToContext, mapThinkingLevel } from './legacy-bridge.js';

describe('mapThinkingLevel', () => {
  it('maps known levels and rejects off/unknown', () => {
    expect(mapThinkingLevel(undefined)).toBeUndefined();
    expect(mapThinkingLevel('off')).toBeUndefined();
    expect(mapThinkingLevel('medium')).toBe('medium');
    expect(mapThinkingLevel('bogus')).toBeUndefined();
  });
});

describe('legacyMessagesToContext', () => {
  it('skips system, nullish entries, and empty systemPrompt', () => {
    const ctx = legacyMessagesToContext('', [
      null as never,
      { role: 'system', content: 'ignore' },
      { role: 'user', content: 'hi' },
    ]);
    expect(ctx.systemPrompt).toBeUndefined();
    expect(ctx.messages).toHaveLength(1);
    expect(ctx.messages[0]).toMatchObject({ role: 'user', content: 'hi' });
  });

  it('appends data-url images from user attachments', () => {
    const ctx = legacyMessagesToContext('sys', [
      {
        role: 'user',
        content: 'caption',
        attachments: {
          images: [
            { dataUrl: 'data:image/png;base64,abc' },
            { dataUrl: 'not-a-data-url' },
          ],
        },
      },
    ]);
    const msg = ctx.messages[0]!;
    expect(msg.role).toBe('user');
    expect(Array.isArray(msg.content)).toBe(true);
    expect(msg.content).toEqual([
      { type: 'text', text: 'caption' },
      { type: 'image', mimeType: 'image/png', data: 'abc' },
    ]);
    expect(ctx.systemPrompt).toBe('sys');
  });

  it('converts assistant tool calls and tool results', () => {
    const ctx = legacyMessagesToContext('p', [
      {
        role: 'assistant',
        text: 'calling',
        toolCalls: [{ id: 'c1', name: 'search', arguments: { q: 'x' } }],
      },
      { role: 'tool', toolCallId: 'c1', name: 'search', content: { ok: true } },
      { role: 'toolResult', content: 'done' },
    ]);
    expect(ctx.messages).toHaveLength(3);
    expect(ctx.messages[0]).toMatchObject({
      role: 'assistant',
      stopReason: 'toolUse',
    });
    expect(ctx.messages[1]).toMatchObject({
      role: 'toolResult',
      toolCallId: 'c1',
      toolName: 'search',
      content: [{ type: 'text', text: '{"ok":true}' }],
    });
    expect(ctx.messages[2]).toMatchObject({
      role: 'toolResult',
      toolCallId: 'tool',
      toolName: 'tool',
      content: [{ type: 'text', text: 'done' }],
    });
  });

  it('treats non-standard roles with text as assistant-like', () => {
    const ctx = legacyMessagesToContext('', [{ role: 'model', text: 'hello' } as never]);
    expect(ctx.messages).toHaveLength(1);
    expect(ctx.messages[0]).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: 'hello' }],
      stopReason: 'stop',
    });
  });

  it('maps tool schemas onto context tools', () => {
    const ctx = legacyMessagesToContext('x', [], [
      {
        type: 'function',
        function: {
          name: 'ping',
          description: 'pong',
          parameters: { type: 'object', properties: {} },
        },
      },
    ]);
    expect(ctx.tools).toHaveLength(1);
    expect(ctx.tools![0]).toMatchObject({ name: 'ping', description: 'pong' });
  });
});
