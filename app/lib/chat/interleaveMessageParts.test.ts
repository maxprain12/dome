import { describe, expect, it } from 'vitest';
import { interleaveMessageParts } from './interleaveMessageParts';
import type { ToolCallData } from '@/components/chat/ChatToolCard';

const t = ((key: string) => key) as never;

function call(name: string, contentOffset?: number, extra: Partial<ToolCallData> = {}): ToolCallData {
  return {
    id: `${name}-${contentOffset ?? 'x'}-${Math.random()}`,
    name,
    arguments: {},
    status: 'success',
    ...(contentOffset === undefined ? {} : { contentOffset }),
    ...extra,
  } as ToolCallData;
}

describe('interleaveMessageParts', () => {
  it('returns nothing for an empty turn', () => {
    expect(interleaveMessageParts('', [], t)).toEqual([]);
  });

  it('returns a lone text part when no tools ran', () => {
    expect(interleaveMessageParts('Hola', [], t)).toEqual([{ type: 'text', text: 'Hola' }]);
  });

  it('puts the card between the prose that surrounds it', () => {
    const parts = interleaveMessageParts(
      'Voy a crear la rama.Rama creada.',
      [call('git_branch_create', 'Voy a crear la rama.'.length)],
      t,
    );
    expect(parts.map((p) => p.type)).toEqual(['text', 'tools', 'text']);
    expect((parts[0] as { text: string }).text).toBe('Voy a crear la rama.');
    expect((parts[2] as { text: string }).text).toBe('Rama creada.');
  });

  it('groups calls issued at the same point into one block', () => {
    const parts = interleaveMessageParts(
      'Leyendo.',
      [call('file_read', 8), call('file_read', 8), call('file_read', 8)],
      t,
    );
    expect(parts.map((p) => p.type)).toEqual(['text', 'tools']);
    const tools = parts[1] as { blocks: unknown[] };
    expect(tools.blocks).toHaveLength(1);
  });

  it('keeps several tool stops in order', () => {
    const text = 'Primero.Segundo.Tercero.';
    const parts = interleaveMessageParts(
      text,
      [call('git_status', 8), call('file_read', 16)],
      t,
    );
    expect(parts.map((p) => p.type)).toEqual(['text', 'tools', 'text', 'tools', 'text']);
  });

  it('handles a tool issued before any prose', () => {
    const parts = interleaveMessageParts('Listo.', [call('git_status', 0)], t);
    expect(parts.map((p) => p.type)).toEqual(['tools', 'text']);
  });

  it('falls back to tools-first for stored messages without offsets', () => {
    const parts = interleaveMessageParts('Resultado.', [call('git_status')], t);
    expect(parts.map((p) => p.type)).toEqual(['tools', 'text']);
  });

  it('clamps an offset beyond the text instead of dropping prose', () => {
    const parts = interleaveMessageParts('corto', [call('git_status', 9999)], t);
    expect(parts.map((p) => p.type)).toEqual(['text', 'tools']);
    expect((parts[0] as { text: string }).text).toBe('corto');
  });

  it('never loses text when offsets are out of order', () => {
    const text = 'AAA.BBB.CCC.';
    const parts = interleaveMessageParts(text, [call('a', 8), call('b', 4)], t);
    const joined = parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('');
    expect(joined).toBe(text);
  });
});
