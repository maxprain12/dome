import { describe, expect, it } from 'vitest';
import { applyTextDelta, pickTerminalAssistantText } from './applyTextDelta';

describe('applyTextDelta', () => {
  it('appends a true token delta', () => {
    expect(applyTextDelta('Hello', ' world')).toBe('Hello world');
  });

  it('replaces when the payload is the accumulated string so far', () => {
    expect(applyTextDelta('Hello', 'Hello world')).toBe('Hello world');
  });

  it('does not concatenate an identical replay of the whole reply', () => {
    const reply = 'Voy a revisar el contacto que tienes en memoria.';
    expect(applyTextDelta(reply, reply)).toBe(reply);
  });

  it('starts from an empty bubble', () => {
    expect(applyTextDelta('', 'Hola')).toBe('Hola');
  });

  it('ignores a prefix replay of the accumulated string', () => {
    expect(applyTextDelta('Hello world', 'Hello')).toBe('Hello world');
  });
});

describe('pickTerminalAssistantText', () => {
  it('keeps the live bubble when the snapshot is the reply concatenated twice', () => {
    const reply = 'Voy a buscar a la persona en tu agenda.';
    expect(pickTerminalAssistantText(`${reply}${reply}`, reply)).toBe(reply);
  });

  it('keeps the longer live bubble when the snapshot is only a prefix', () => {
    expect(pickTerminalAssistantText('Voy a buscar', 'Voy a buscar a la persona.')).toBe(
      'Voy a buscar a la persona.',
    );
  });
});
