import { describe, expect, it } from 'vitest';
import { extractActionSuggestions } from './actionSuggestions';
import type { ToolCallData } from '@/components/chat/ChatToolCard';

function call(partial: Partial<ToolCallData> & Pick<ToolCallData, 'id' | 'name'>): ToolCallData {
  return {
    arguments: {},
    status: 'running',
    ...partial,
  };
}

describe('extractActionSuggestions', () => {
  it('builds github issue suggestion with assignees', () => {
    const suggestions = extractActionSuggestions([
      call({
        id: '1',
        name: 'github_create_issue',
        arguments: {
          repo_id: 'ghr-1',
          title: 'Fix mentions',
          assignees: ['maxprain'],
          body: 'Details',
        },
      }),
    ]);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.kind).toBe('github_issue');
    expect(suggestions[0]?.fields.some((f) => f.label === 'assignees' && f.value.includes('@maxprain'))).toBe(
      true,
    );
    expect(suggestions[0]?.confirmText).toContain('@maxprain');
  });

  it('builds email suggestion from to/subject', () => {
    const suggestions = extractActionSuggestions([
      call({
        id: '2',
        name: 'email_send',
        status: 'pending',
        arguments: { to: 'alder@example.com', subject: 'Hi', body: 'Hello' },
      }),
    ]);
    expect(suggestions[0]?.kind).toBe('email');
    expect(suggestions[0]?.fields.find((f) => f.label === 'to')?.value).toBe('alder@example.com');
  });

  it('skips error calls and unknown tools', () => {
    expect(
      extractActionSuggestions([
        call({ id: '3', name: 'email_list', arguments: {} }),
        call({
          id: '4',
          name: 'github_create_issue',
          status: 'error',
          arguments: { title: 'x', repo_id: 'r' },
        }),
      ]),
    ).toEqual([]);
  });
});
