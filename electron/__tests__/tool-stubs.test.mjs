/**
 * Catalog stubs: one-line cards + get_tool_definition expands the schema.
 * Run: node --test electron/__tests__/tool-stubs.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  CORE_FULL_SCHEMA_TOOLS,
  STUB_LOOKUP_HINT,
  applyToolStubs,
  isStubParameters,
  toStubToolDefinition,
  firstLineDescription,
} = require('../tools/tool-stubs.cjs');
const { getAllToolDefinitions } = require('../tools/tool-definitions.cjs');

const catalogNames = getAllToolDefinitions().map((d) => d.function.name);

describe('toStubToolDefinition', () => {
  it('keeps the name, one-line description, and empty parameters', () => {
    const stub = toStubToolDefinition({
      type: 'function',
      function: {
        name: 'excel_set_cell',
        description:
          'Writes a cell in a library Excel workbook. Use after excel_get to locate the sheet.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string' },
            cell: { type: 'string' },
          },
          required: ['resource_id', 'cell'],
        },
      },
    });
    assert.equal(stub.function.name, 'excel_set_cell');
    assert.ok(stub.function.description.includes(STUB_LOOKUP_HINT));
    assert.ok(stub.function.description.length < 180);
    assert.deepEqual(stub.function.parameters.properties, {});
    assert.equal(isStubParameters(stub.function.parameters), true);
  });

  it('truncates a long first sentence', () => {
    const line = firstLineDescription('A'.repeat(200), 120);
    assert.ok(line.length <= 120);
    assert.ok(line.endsWith('…'));
  });
});

describe('native tool failure contract', () => {
  it('throws structured failures with retry guidance intact', async () => {
    const { createToolRegistry } = await import('@dome/tools');
    for (const failure of [
      { success: false, error: 'Unavailable', code: 'search_unavailable', retryable: false, retryAfterMs: 60000 },
      { status: 'error', error: 'Unavailable', code: 'search_unavailable', retryable: false, retryAfterMs: 60000 },
    ]) {
      const [tool] = createToolRegistry([{ name: 'research_search', parameters: { type: 'object', properties: {} } }], {
        executeToolInMain: async () => failure,
      });
      await assert.rejects(tool.execute('search-test', {}), (error) => {
        assert.deepEqual(JSON.parse(error.message), failure);
        return true;
      });
    }
  });

  it('keeps a successful empty search as a normal result', async () => {
    const { createToolRegistry } = await import('@dome/tools');
    const result = { success: true, results: [], count: 0 };
    const [tool] = createToolRegistry([{ name: 'research_search', parameters: { type: 'object', properties: {} } }], {
      executeToolInMain: async () => result,
    });
    const output = await tool.execute('search-test', {});
    assert.deepEqual(JSON.parse(output.content[0].text), result);
  });
});

describe('applyToolStubs', () => {
  it('keeps core tools full and stubs the rest', () => {
    const tools = [
      {
        name: 'get_tool_definition',
        description: 'Get the full schema of any tool.',
        parameters: { type: 'object', properties: { tool_name: { type: 'string' } } },
        execute: async () => ({ content: [] }),
      },
      {
        name: 'excel_set_cell',
        description: 'Writes a cell in a library Excel.',
        parameters: { type: 'object', properties: { cell: { type: 'string' } } },
        execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
      },
    ];
    const { offered, fullByName } = applyToolStubs(tools);
    const core = offered.find((t) => t.name === 'get_tool_definition');
    const stub = offered.find((t) => t.name === 'excel_set_cell');
    assert.equal(isStubParameters(core.parameters), false);
    assert.equal(isStubParameters(stub.parameters), true);
    assert.equal(fullByName.get('excel_set_cell'), tools[1]);
    assert.ok(CORE_FULL_SCHEMA_TOOLS.includes('get_tool_definition'));
  });

  it('expands coding tools when a workspace is open', () => {
    const tools = [
      {
        name: 'shell_exec',
        description: 'Run a shell command.',
        parameters: { type: 'object', properties: { command: { type: 'string' } } },
      },
    ];
    const stubbed = applyToolStubs(tools, { coding: false });
    assert.equal(isStubParameters(stubbed.offered[0].parameters), true);
    const full = applyToolStubs(tools, { coding: true });
    assert.equal(isStubParameters(full.offered[0].parameters), false);
  });

  it('keeps injected browser tools fully schemed', () => {
    const tools = [
      {
        name: 'browser_scroll',
        description: 'Scroll the controlled page.',
        parameters: { type: 'object', properties: { direction: { type: 'string' } } },
      },
    ];
    const stubbed = applyToolStubs(tools);
    assert.equal(isStubParameters(stubbed.offered[0].parameters), true);
    const full = applyToolStubs(tools, { expandedNames: ['browser_scroll'] });
    assert.equal(isStubParameters(full.offered[0].parameters), false);
    assert.equal(full.offered[0], tools[0]);
  });

  it('references real catalog names for the core set', () => {
    const ghosts = CORE_FULL_SCHEMA_TOOLS.filter(
      (n) => !catalogNames.includes(n) && n !== 'task' && n !== 'delegate_to_agent',
    );
    assert.deepEqual(ghosts, [], `core names not in the catalog: ${ghosts.join(', ')}`);
  });
});
