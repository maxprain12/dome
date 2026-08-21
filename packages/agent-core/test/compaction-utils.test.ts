import { describe, expect, it } from 'vitest';
import type { Message } from '@dome/ai';
import {
  computeFileLists,
  createFileOps,
  extractFileOpsFromMessage,
  formatFileOperations,
  serializeConversation,
} from '../src/harness/compaction/utils.js';
import type { AgentMessage } from '../src/types.js';

const assistant = (content: Extract<Message, { role: 'assistant' }>['content']): Message =>
  ({
    role: 'assistant',
    content,
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
    stopReason: 'stop',
    timestamp: 1,
  }) as Message;

describe('extractFileOpsFromMessage / computeFileLists', () => {
  it('records read/write/edit paths and classifies read-only vs modified', () => {
    const fileOps = createFileOps();
    extractFileOpsFromMessage(
      assistant([
        { type: 'toolCall', id: '1', name: 'read', arguments: { path: 'a.ts' } },
        { type: 'toolCall', id: '2', name: 'write', arguments: { path: 'b.ts' } },
        { type: 'toolCall', id: '3', name: 'edit', arguments: { path: 'c.ts' } },
        { type: 'toolCall', id: '4', name: 'read', arguments: { path: 'b.ts' } },
        { type: 'toolCall', id: '5', name: 'read', arguments: { other: true } },
        { type: 'text', text: 'ignore' },
      ]) as AgentMessage,
      fileOps,
    );
    extractFileOpsFromMessage({ role: 'user', content: 'hi', timestamp: 1 } as AgentMessage, fileOps);

    const { readFiles, modifiedFiles } = computeFileLists(fileOps);
    expect(readFiles).toEqual(['a.ts']);
    expect(modifiedFiles).toEqual(['b.ts', 'c.ts']);
  });
});

describe('formatFileOperations', () => {
  it('returns empty string when both lists are empty', () => {
    expect(formatFileOperations([], [])).toBe('');
  });

  it('formats read and modified sections', () => {
    expect(formatFileOperations(['a.ts'], ['b.ts'])).toBe(
      '\n\n<read-files>\na.ts\n</read-files>\n\n<modified-files>\nb.ts\n</modified-files>',
    );
  });
});

describe('serializeConversation', () => {
  it('serializes user, assistant, and toolResult messages with truncation', () => {
    const longResult = 'x'.repeat(2100);
    const text = serializeConversation([
      { role: 'user', content: 'hello', timestamp: 1 },
      { role: 'user', content: [{ type: 'text', text: 'typed' }], timestamp: 2 },
      { role: 'user', content: '', timestamp: 3 },
      assistant([
        { type: 'thinking', thinking: 'plan' },
        { type: 'text', text: 'answer' },
        { type: 'toolCall', id: 't1', name: 'read', arguments: { path: 'f.ts', n: 1 } },
      ]),
      {
        role: 'toolResult',
        toolCallId: 't1',
        toolName: 'read',
        content: [{ type: 'text', text: longResult }],
        isError: false,
        timestamp: 4,
      },
      {
        role: 'toolResult',
        toolCallId: 't2',
        toolName: 'read',
        content: [],
        isError: false,
        timestamp: 5,
      },
    ]);

    expect(text).toContain('[User]: hello');
    expect(text).toContain('[User]: typed');
    expect(text).toContain('[Assistant thinking]: plan');
    expect(text).toContain('[Assistant]: answer');
    expect(text).toContain('[Assistant tool calls]: read(path="f.ts", n=1)');
    expect(text).toContain('[Tool result]: ');
    expect(text).toContain('more characters truncated');
    expect(text).not.toContain('[User]: \n\n[Assistant thinking]');
  });

  it('stringifies unserializable tool-call args safely', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const text = serializeConversation([
      assistant([{ type: 'toolCall', id: 't1', name: 'write', arguments: { path: 'x.ts', meta: cyclic } }]),
    ]);
    expect(text).toContain('[Assistant tool calls]: write(path="x.ts", meta=[unserializable])');
  });
});
