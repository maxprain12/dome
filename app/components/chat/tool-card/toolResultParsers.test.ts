import { describe, expect, it } from 'vitest';
import {
  smartToolSummary,
  formatArgsSummary,
  parseArtifactResult,
  parsePeopleToolResult,
  parseToolDefinitionResult,
} from './toolResultParsers';

describe('parseArtifactResult', () => {
  const legacyList = { type: 'list', title: 'Items', items: [{ text: 'a' }] };
  const htmlArtifact = { type: 'html', title: 'Preview', html: '<p>hi</p>' };

  it('returns null for empty or non-object results', () => {
    expect(parseArtifactResult(null)).toBeNull();
    expect(parseArtifactResult(undefined)).toBeNull();
    expect(parseArtifactResult(42)).toBeNull();
    expect(parseArtifactResult('not-json')).toBeNull();
    expect(parseArtifactResult('{"ok":true}')).toBeNull();
  });

  it('reads a top-level artifact object (object or JSON string)', () => {
    expect(parseArtifactResult({ artifact: legacyList })).toEqual(legacyList);
    expect(parseArtifactResult(JSON.stringify({ artifact: legacyList }))).toEqual(legacyList);
  });

  it('reads artifact nested in MCP content[0].text JSON', () => {
    expect(
      parseArtifactResult({
        content: [{ text: JSON.stringify({ artifact: legacyList }) }],
      }),
    ).toEqual(legacyList);
  });

  it('reads artifact nested under details', () => {
    expect(parseArtifactResult({ details: { artifact: legacyList } })).toEqual(legacyList);
  });

  it('prefers top-level artifact over content/details fallbacks', () => {
    const other = { type: 'chart', title: 'Other' };
    expect(
      parseArtifactResult({
        artifact: legacyList,
        content: [{ text: JSON.stringify({ artifact: other }) }],
        details: { artifact: other },
      }),
    ).toEqual(legacyList);
  });

  it('validates Zod artifact types and rejects invalid payloads', () => {
    expect(parseArtifactResult({ artifact: htmlArtifact })).toEqual(htmlArtifact);
    expect(parseArtifactResult({ artifact: { type: 'html' } })).toBeNull();
  });

  it('rejects unknown artifact types', () => {
    expect(parseArtifactResult({ artifact: { type: 'not_a_real_type' } })).toBeNull();
  });

  it('ignores unparsable content text without failing', () => {
    expect(parseArtifactResult({ content: [{ text: 'not-json' }] })).toBeNull();
  });
});

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

describe('parsePeopleToolResult', () => {
  const person = {
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    displayName: 'Mery Sugy',
    primaryEmail: 'mery@example.com',
    leadStatus: 'lead',
    identities: [
      { source: 'website', externalId: 'https://mery.example', displayLabel: 'mery.example' },
    ],
  };

  it('reads people_get / people_upsert person rows', () => {
    const view = parsePeopleToolResult({ success: true, source: 'people', person });
    expect(view?.rows).toHaveLength(1);
    expect(view?.rows[0]?.displayName).toBe('Mery Sugy');
    expect(view?.rows[0]?.email).toBe('mery@example.com');
    expect(view?.rows[0]?.leadStatus).toBe('lead');
    expect(view?.rows[0]?.identities[0]?.label).toBe('mery.example');
    expect(view?.rows[0]?.personId).toBe(person.id);
  });

  it('never uses a raw id as the display name', () => {
    const view = parsePeopleToolResult({
      person: { id: person.id, displayName: person.id, primaryEmail: 'ok@example.com' },
    });
    expect(view?.rows[0]?.displayName).toBe('ok@example.com');
  });

  it('reads people_ingest lists and MCP-wrapped JSON', () => {
    const wrapped = {
      content: [{ text: JSON.stringify({ people: [person], count: 1 }) }],
    };
    const view = parsePeopleToolResult(wrapped);
    expect(view?.rows[0]?.displayName).toBe('Mery Sugy');
  });

  it('reads people_link_identity person + identity', () => {
    const view = parsePeopleToolResult({
      success: true,
      linked: true,
      person: { displayName: 'Ada', identities: [] },
      identity: { source: 'email', externalId: 'ada@example.com' },
    });
    expect(view?.linked).toBe(true);
    expect(view?.rows[0]?.identities[0]?.label).toBe('ada@example.com');
  });

  it('returns null for empty or unrelated payloads', () => {
    expect(parsePeopleToolResult(null)).toBeNull();
    expect(parsePeopleToolResult({ success: true, definition: { name: 'x' } })).toBeNull();
  });
});

describe('parseToolDefinitionResult', () => {
  it('reads name and description from the OpenAI-style envelope', () => {
    const view = parseToolDefinitionResult({
      success: true,
      definition: {
        type: 'function',
        function: {
          name: 'people_link_identity',
          description: 'Link an identity to a person.',
          parameters: { type: 'object', properties: { person_id: { type: 'string' } } },
        },
      },
    });
    expect(view).toEqual({
      name: 'people_link_identity',
      description: 'Link an identity to a person.',
    });
  });

  it('reads a flat definition and ignores schema-only dumps without name/description', () => {
    expect(
      parseToolDefinitionResult({
        definition: { name: 'web_search', description: 'Search the web' },
      }),
    ).toEqual({ name: 'web_search', description: 'Search the web' });
    expect(parseToolDefinitionResult({ parameters: { type: 'object' } })).toBeNull();
  });
});
