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

  it('round-trips user image blocks into attachments.images', () => {
    const msgs = harnessMessagesToManyMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'mira esto' },
          { type: 'image', data: 'abc123', mimeType: 'image/png' },
        ],
        timestamp: 42,
      },
    ]);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.content).toBe('mira esto');
    expect(msgs[0]?.attachments?.images).toHaveLength(1);
    expect(msgs[0]?.attachments?.images[0]).toMatchObject({
      dataUrl: 'data:image/png;base64,abc123',
      mime: 'image/png',
      name: 'image',
    });
  });

  it('attaches dome.pins written after the assistant turn to the preceding user', () => {
    const msgs = harnessMessagesToManyMessages([
      { role: 'user', content: 'puedes decirme como he conocido a esta persona', timestamp: 100 },
      assistant({ type: 'text', text: 'Voy a buscarla.' }),
      {
        role: 'toolResult',
        toolCallId: 'tc-1',
        toolName: 'people_get',
        content: [{ type: 'text', text: '{"ok":true}' }],
        timestamp: 150,
      },
      assistant({ type: 'text', text: 'La conociste por Instagram.' }),
      {
        role: 'custom',
        customType: 'dome.pins',
        details: {
          messageTimestamp: 100,
          pinnedResources: [
            { id: 'person_fa90', title: '@mery_sugy', type: 'person', kind: 'person' },
          ],
        },
      },
      { role: 'user', content: 'modifica la ficha', timestamp: 300 },
    ]);
    const users = msgs.filter((m) => m.role === 'user');
    expect(users).toHaveLength(2);
    expect(users[0]?.pinnedResources?.[0]).toMatchObject({
      id: 'person_fa90',
      title: '@mery_sugy',
    });
    expect(users[1]?.pinnedResources).toBeUndefined();
  });

  it('attaches dome.pins custom entries to the nearest user turn', () => {
    const msgs = harnessMessagesToManyMessages([
      { role: 'user', content: 'qué me puedes decir de este contacto?', timestamp: 100 },
      {
        role: 'custom',
        customType: 'dome.pins',
        details: {
          messageTimestamp: 100,
          pinnedResources: [{ id: 'sp-1', title: 'mery_sugy', type: 'person', kind: 'person' }],
        },
      },
      { role: 'assistant', content: [{ type: 'text', text: 'Es un contacto.' }], timestamp: 200 },
    ]);
    const user = msgs.find((m) => m.role === 'user');
    expect(user?.pinnedResources?.[0]).toMatchObject({
      id: 'sp-1',
      title: 'mery_sugy',
      type: 'person',
    });
  });

  it('replaces a prefix assistant block when the next block restates the whole turn', () => {
    const first = 'Voy a buscar a la persona en tu agenda de contactos.';
    const full = `${first}\n\nYa tengo la ficha de @mery_sugy.`;
    const msgs = harnessMessagesToManyMessages([
      { role: 'user', content: 'quién es?' },
      assistant({ type: 'text', text: first }),
      assistant({ type: 'text', text: full }),
    ]);
    const assistantMsgs = msgs.filter((m) => m.role === 'assistant');
    expect(assistantMsgs).toHaveLength(1);
    expect(assistantMsgs[0]?.content).toBe(full);
  });

  it('does not concatenate a repeated assistant block of the same reply', () => {
    const reply = 'Voy a revisar el contacto que tienes en memoria.';
    const msgs = harnessMessagesToManyMessages([
      { role: 'user', content: 'quién es @mery_sugy?' },
      assistant({ type: 'text', text: reply }),
      assistant({ type: 'text', text: reply }),
    ]);
    const assistantMsgs = msgs.filter((m) => m.role === 'assistant');
    expect(assistantMsgs).toHaveLength(1);
    expect(assistantMsgs[0]?.content).toBe(reply);
  });
});
