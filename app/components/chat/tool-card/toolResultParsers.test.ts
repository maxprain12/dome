import { describe, expect, it } from 'vitest';
import { smartToolSummary, formatArgsSummary } from './toolResultParsers';

describe('smartToolSummary', () => {
  it('shows only the tail of a long absolute path', () => {
    const summary = smartToolSummary('file_read', {
      file_path: '/Users/me/Documents/proyectos/dome/electron/tools/ai-tools-handler.cjs',
    });
    expect(summary).toBe('tools/ai-tools-handler.cjs');
  });

  it('leaves a short path intact', () => {
    expect(smartToolSummary('file_read', { file_path: 'package.json' })).toBe('package.json');
  });

  it('accepts `path` as an alias for `file_path`', () => {
    expect(smartToolSummary('file_edit', { path: '/a/b/c/d.ts' })).toBe('c/d.ts');
  });

  it('pairs a grep pattern with where it searched', () => {
    expect(
      smartToolSummary('file_grep', {
        pattern: 'TODO',
        path: '/Users/me/proyectos/dome/electron',
      }),
    ).toBe('"TODO" in dome/electron');
  });

  it('shows the command for shell_exec', () => {
    expect(smartToolSummary('shell_exec', { command: 'pnpm run build' })).toBe('pnpm run build');
  });

  it('truncates an over-long value with an ellipsis', () => {
    const long = 'x'.repeat(200);
    const summary = smartToolSummary('shell_exec', { command: long });
    expect(summary.length).toBeLessThanOrEqual(72);
    expect(summary.endsWith('…')).toBe(true);
  });

  it('describes git tools without dumping their arguments', () => {
    expect(smartToolSummary('git_branch_create', { name: 'fix/issue-1029' })).toBe('fix/issue-1029');
    expect(smartToolSummary('git_log', { limit: 8 })).toBe('last 8');
    expect(smartToolSummary('git_diff', { staged: true })).toBe('staged');
    expect(smartToolSummary('git_diff', {})).toBe('working tree');
    expect(smartToolSummary('git_commit', { message: 'fix: guard null' })).toBe('fix: guard null');
  });

  it('joins staged paths for git_add', () => {
    expect(smartToolSummary('git_add', { paths: ['/repo/src/a.ts', '/repo/src/b.ts'] })).toBe(
      'src/a.ts, src/b.ts',
    );
  });

  it('renders a delegation as subagent plus intent', () => {
    expect(smartToolSummary('task', { subagent_type: 'coding', prompt: 'refactor X' })).toBe(
      'coding: refactor X',
    );
  });

  it('quotes search queries', () => {
    expect(smartToolSummary('web_search', { query: 'electron ipc' })).toBe('"electron ipc"');
  });

  it('returns an empty summary for a tool with no arguments to show', () => {
    expect(smartToolSummary('git_status', {})).toBe('');
  });

  it('falls back to the generic dump for unknown tools', () => {
    expect(smartToolSummary('some_unknown_tool', { a: 1 })).toBe(formatArgsSummary({ a: 1 }));
  });

  it('survives missing or malformed arguments', () => {
    expect(smartToolSummary('file_read', undefined as never)).toBe('');
    expect(smartToolSummary('', {})).toBe('');
  });
});
