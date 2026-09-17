import { describe, expect, it } from 'vitest';
import type { ToolCallData } from '@/components/chat/ChatToolCard';
import type { ToolDisplayBlock } from '@/lib/chat/groupToolCalls';
import {
  activitySegmentsFromBlocks,
  activityTraceCopyFromT,
  buildCodingTraceRows,
  buildSearchTraceRows,
  buildStepsTraceRows,
  classifyToolKind,
  codingActionForTool,
  groupCallsByContiguousKind,
  parseCodingMeta,
  parseWebSearchHits,
  parseWebSearchQuery,
  traceHeaderLabel,
} from './manyActivityTrace';

const copy = activityTraceCopyFromT((key, opts) => {
  if (key === 'trace_ran_tools') return `ran:${String(opts?.count ?? '')}`;
  if (key === 'trace_steps_done') return `steps:${String(opts?.count ?? '')}`;
  if (key === 'trace_more_results') return `more:${String(opts?.count ?? '')}`;
  return key;
});

let seq = 0;
function call(name: string, extra: Partial<ToolCallData> = {}): ToolCallData {
  seq += 1;
  return {
    id: `c${seq}`,
    name,
    arguments: {},
    status: 'success',
    ...extra,
  };
}

describe('classifyToolKind', () => {
  it('classifies search, coding aliases and leftover tools as steps', () => {
    expect(classifyToolKind('web_search')).toBe('search');
    expect(classifyToolKind('web_fetch')).toBe('search');
    expect(classifyToolKind('deep_research')).toBe('search');
    expect(classifyToolKind('read_file')).toBe('coding');
    expect(classifyToolKind('edit_file')).toBe('coding');
    expect(classifyToolKind('glob')).toBe('coding');
    expect(classifyToolKind('ls')).toBe('coding');
    expect(classifyToolKind('git_status')).toBe('coding');
    expect(classifyToolKind('shell_exec')).toBe('coding');
    expect(classifyToolKind('resource_search')).toBe('steps');
    expect(classifyToolKind('calendar_list_events')).toBe('steps');
  });
});

describe('groupCallsByContiguousKind', () => {
  it('groups only contiguous kinds and does not reorder mixed tools', () => {
    const groups = groupCallsByContiguousKind([
      call('file_read'),
      call('file_edit'),
      call('web_search'),
      call('file_read'),
      call('resource_get'),
    ]);
    expect(groups.map((group) => [group.kind, group.calls.length])).toEqual([
      ['coding', 2],
      ['search', 1],
      ['coding', 1],
      ['steps', 1],
    ]);
  });

  it('keeps write_todos as standalone groups', () => {
    const groups = groupCallsByContiguousKind([
      call('web_search'),
      call('write_todos'),
      call('write_todos'),
      call('web_fetch'),
    ]);
    expect(groups.map((group) => group.kind)).toEqual(['search', 'todos', 'todos', 'search']);
  });
});

describe('activitySegmentsFromBlocks', () => {
  it('flattens consecutive display groups into one coding trace', () => {
    const readA = call('file_read');
    const readB = call('file_read');
    const edit = call('file_edit');
    const search = call('web_search');
    const blocks: ToolDisplayBlock[] = [
      { type: 'tool-group', name: 'file_read', calls: [readA, readB] },
      { type: 'tool', call: edit },
      { type: 'tool', call: search },
    ];
    const segments = activitySegmentsFromBlocks(blocks);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ type: 'trace', kind: 'coding' });
    expect(segments[1]).toMatchObject({ type: 'trace', kind: 'search' });
    if (segments[0]?.type === 'trace') {
      expect(segments[0].calls.map((item) => item.id)).toEqual([readA.id, readB.id, edit.id]);
    }
  });

  it('nests subagent work without pulling later supervisor tools inside', () => {
    const innerRead = call('file_read', { agentName: 'coding' });
    const innerSearch = call('web_search', { agentName: 'coding' });
    const after = call('resource_get');
    const segments = activitySegmentsFromBlocks([
      {
        type: 'subagent',
        agentKey: 'coding',
        agentLabel: 'Coding',
        blocks: [
          { type: 'tool', call: innerRead },
          { type: 'tool', call: innerSearch },
        ],
      },
      { type: 'tool', call: after },
    ]);
    expect(segments[0]?.type).toBe('subagent');
    if (segments[0]?.type === 'subagent') {
      expect(segments[0].segments.map((item) => (item.type === 'trace' ? item.kind : item.type))).toEqual([
        'coding',
        'search',
      ]);
    }
    expect(segments[1]).toMatchObject({ type: 'trace', kind: 'steps' });
  });
});

describe('parseWebSearchHits', () => {
  it('reads title, url and site from a wrapped payload', () => {
    expect(
      parseWebSearchHits({
        query: 'collapsible',
        results: [
          {
            title: 'Base UI Collapsible',
            url: 'https://base-ui.com/collapsible',
            siteName: 'Base UI',
          },
        ],
      }),
    ).toEqual([
      {
        title: 'Base UI Collapsible',
        url: 'https://base-ui.com/collapsible',
        siteName: 'Base UI',
      },
    ]);
  });

  it('parses JSON strings, skips bad urls and falls back past opaque titles', () => {
    const hits = parseWebSearchHits(
      JSON.stringify([
        { title: '550e8400-e29b-41d4-a716-446655440000', url: 'https://www.example.com/docs' },
        { title: 'Ignored', url: 'javascript:alert(1)' },
        { title: 'Kept', url: 'https://dome.app/blog' },
      ]),
    );
    expect(hits).toEqual([
      { title: 'example.com', url: 'https://www.example.com/docs', siteName: 'example.com' },
      { title: 'Kept', url: 'https://dome.app/blog', siteName: 'dome.app' },
    ]);
  });

  it('returns nothing for malformed payloads', () => {
    expect(parseWebSearchHits('not-json')).toEqual([]);
    expect(parseWebSearchHits({ ok: true })).toEqual([]);
    expect(parseWebSearchHits(null)).toEqual([]);
  });
});

describe('parseWebSearchQuery', () => {
  it('prefers args and falls back to the result payload', () => {
    expect(parseWebSearchQuery({ query: 'react collapsible' })).toBe('react collapsible');
    expect(parseWebSearchQuery({}, JSON.stringify({ query: 'from result' }))).toBe('from result');
    expect(parseWebSearchQuery({ query: 'sp-abc123' })).toBe('');
  });
});

describe('parseCodingMeta', () => {
  it('reads edit actions, file names and tolerant diff counts', () => {
    expect(codingActionForTool('edit_file')).toBe('edit');
    expect(
      parseCodingMeta({
        name: 'file_edit',
        arguments: { file_path: '/tmp/src/App.tsx' },
        result: { lines_added: 4, lines_removed: 2 },
      }),
    ).toEqual({ action: 'edit', target: 'App.tsx', add: 4, del: 2 });
  });

  it('reads structured hunks and shell commands', () => {
    expect(
      parseCodingMeta({
        name: 'file_write',
        arguments: {},
        result: {
          file_path: 'src/lib/trace.ts',
          lines_added: 8,
          lines_removed: 0,
          diff_hunks: [{ oldStart: 1, oldLines: 0, newStart: 1, newLines: 1, lines: [{ type: '+', text: 'x', oldNum: null, newNum: 1 }] }],
        },
      }),
    ).toMatchObject({ action: 'write', target: 'trace.ts', add: 8 });

    expect(
      parseCodingMeta({
        name: 'shell_exec',
        arguments: {},
        result: JSON.stringify({ command: 'pnpm test', output: 'ok', exitCode: 0 }),
      }),
    ).toMatchObject({ action: 'run', target: 'pnpm test' });
  });
});

describe('trace rows and labels', () => {
  it('caps search hits and keeps the query', () => {
    const hits = Array.from({ length: 7 }, (_, index) => ({
      title: `Hit ${index + 1}`,
      url: `https://example.com/${index + 1}`,
    }));
    const built = buildSearchTraceRows(
      [call('web_search', { arguments: { query: 'many traces' }, result: { results: hits } })],
      copy.untitledResult,
    );
    expect(built.query).toBe('many traces');
    expect(built.rows).toHaveLength(5);
    expect(built.moreCount).toBe(2);
    expect(built.rows[0]?.primary).toBe('Hit 1');
  });

  it('builds coding and step rows with human labels, not ids', () => {
    const coding = buildCodingTraceRows(
      [
        call('file_read', {
          id: 'opaque-id',
          arguments: { path: '/Users/max/notes.md' },
        }),
      ],
      copy.codingActions,
    );
    expect(coding[0]).toMatchObject({ primary: 'trace_coding_read', secondary: 'notes.md' });
    expect(coding[0]?.primary).not.toBe('opaque-id');

    const steps = buildStepsTraceRows(
      [call('calendar_list_events', { arguments: { query: 'standup' } })],
      (key) => key,
    );
    expect(steps[0]?.primary).not.toMatch(/c\d+/);
    expect(steps[0]?.secondary).toBe('standup');
  });

  it('resolves active and completed headers', () => {
    expect(traceHeaderLabel('reasoning', true, 0, copy)).toBe('trace_thinking');
    expect(traceHeaderLabel('reasoning', false, 0, copy)).toBe('trace_reasoning_done');
    expect(traceHeaderLabel('search', true, 3, copy)).toBe('trace_searching');
    expect(traceHeaderLabel('search', false, 3, copy)).toBe('trace_searched');
    expect(traceHeaderLabel('coding', true, 2, copy)).toBe('trace_coding');
    expect(traceHeaderLabel('coding', false, 2, copy)).toBe('ran:2');
    expect(traceHeaderLabel('steps', false, 1, copy)).toBe('steps:1');
  });
});
