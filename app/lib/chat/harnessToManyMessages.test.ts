import { describe, expect, it } from 'vitest';
import { harnessMessagesToManyMessages } from './harnessToManyMessages';

/** Shape of a stored agent-core assistant turn: one ordered content array. */
const assistant = (...blocks: unknown[]) => ({ role: 'assistant', content: blocks, timestamp: 1 });
const toolResult = (toolCallId: string, text: string) => ({
  role: 'toolResult',
  toolCallId,
  content: [{ type: 'text', text }],
});

describe('harnessMessagesToManyMessages — interleaving', () => {
  it('records where each tool call sat in the prose', () => {
    const msgs = harnessMessagesToManyMessages([
      { role: 'user', content: 'revisa el correo' },
      assistant(
        { type: 'text', text: 'Voy a mirar la bandeja.' },
        { type: 'toolCall', id: 't1', name: 'email_list', arguments: {} },
      ),
      toolResult('t1', '{"ok":true}'),
      assistant(
        { type: 'text', text: 'Ahora filtro los relevantes.' },
        { type: 'toolCall', id: 't2', name: 'email_search', arguments: {} },
      ),
      toolResult('t2', '{"ok":true}'),
      assistant({ type: 'text', text: 'Listo.' }),
    ]);

    const reply = msgs.find((m) => m.role === 'assistant');
    expect(reply).toBeDefined();
    const calls = reply!.toolCalls ?? [];
    expect(calls).toHaveLength(2);

    const [first, second] = calls as Array<{ contentOffset?: number }>;
    expect(first.contentOffset).toBe('Voy a mirar la bandeja.'.length);
    // Second call sits after the first two paragraphs joined by a blank line.
    expect(second.contentOffset).toBe(
      'Voy a mirar la bandeja.\n\nAhora filtro los relevantes.'.length,
    );
    expect(first.contentOffset!).toBeLessThan(second.contentOffset!);
  });

  it('keeps every offset inside the final content', () => {
    const msgs = harnessMessagesToManyMessages([
      { role: 'user', content: 'x' },
      assistant(
        { type: 'text', text: '  con espacio inicial' },
        { type: 'toolCall', id: 't1', name: 'git_status', arguments: {} },
      ),
      toolResult('t1', 'ok'),
    ]);
    const reply = msgs.find((m) => m.role === 'assistant')!;
    const call = (reply.toolCalls ?? [])[0] as { contentOffset?: number };
    expect(call.contentOffset).toBeGreaterThanOrEqual(0);
    expect(call.contentOffset).toBeLessThanOrEqual(reply.content.length);
  });

  it('marks a call issued before any prose as offset 0', () => {
    const msgs = harnessMessagesToManyMessages([
      { role: 'user', content: 'x' },
      assistant({ type: 'toolCall', id: 't1', name: 'git_status', arguments: {} }),
      toolResult('t1', 'ok'),
      assistant({ type: 'text', text: 'Hecho.' }),
    ]);
    const reply = msgs.find((m) => m.role === 'assistant')!;
    const call = (reply.toolCalls ?? [])[0] as { contentOffset?: number };
    expect(call.contentOffset).toBe(0);
  });

  it('still returns the turn when there is no prose at all', () => {
    const msgs = harnessMessagesToManyMessages([
      { role: 'user', content: 'x' },
      assistant({ type: 'toolCall', id: 't1', name: 'git_status', arguments: {} }),
      toolResult('t1', 'ok'),
    ]);
    const reply = msgs.find((m) => m.role === 'assistant');
    expect(reply?.toolCalls).toHaveLength(1);
  });
});
