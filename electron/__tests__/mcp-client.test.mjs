import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  parseMcpServersConfig,
  buildMcpServersObject,
  sanitizeMcpStdioArgs,
  sanitizeArgs,
  normalizeServerEntry,
  normalizeCallToolResult,
  testSingleMcpServer,
  buildStdioEnv,
  exposedToolName,
  filterToolsForServerPolicy,
  loadToolsForServer,
  closeAllMcpClients,
  getMCPTools,
} = require('../mcp/mcp-client.cjs');

describe('mcp-client — config parsing', () => {
  it('parseMcpServersConfig accepts array format', () => {
    const servers = parseMcpServersConfig(JSON.stringify([
      { name: 'fs', type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'] },
      { name: 'api', type: 'http', url: 'https://example.com/mcp', headers: { Authorization: 'Bearer x' } },
      { name: 'legacy', type: 'sse', url: 'https://example.com/sse' },
    ]));
    assert.equal(servers.length, 3);
    assert.equal(servers[0].type, 'stdio');
    assert.equal(servers[1].type, 'http');
    assert.equal(servers[2].type, 'sse');
  });

  it('parseMcpServersConfig accepts mcpServers object format', () => {
    const servers = parseMcpServersConfig(JSON.stringify({
      mcpServers: {
        github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
      },
    }));
    assert.equal(servers.length, 1);
    assert.equal(servers[0].name, 'github');
    assert.equal(servers[0].type, 'stdio');
  });

  it('buildMcpServersObject maps transports and sanitizes stdio args', () => {
    const obj = buildMcpServersObject([
      {
        name: 'fs',
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'pkg', '--localstorage-file'],
        env: { FOO: 'bar' },
      },
      { name: 'api', type: 'http', url: 'https://example.com/mcp', headers: { 'X-Key': '1' } },
    ]);
    assert.equal(obj.fs.transport, 'stdio');
    assert.deepEqual(obj.fs.args, ['-y', 'pkg']);
    assert.equal(obj.fs.env.FOO, 'bar');
    assert.equal(obj.api.transport, 'http');
    assert.equal(obj.api.headers['X-Key'], '1');
  });

  it('sanitizeMcpStdioArgs drops orphan --localstorage-file', () => {
    assert.deepEqual(
      sanitizeMcpStdioArgs(['-y', 'pkg', '--localstorage-file']),
      ['-y', 'pkg'],
    );
    assert.deepEqual(
      sanitizeMcpStdioArgs(['--localstorage-file', '/tmp/store', '-y', 'pkg']),
      ['--localstorage-file', '/tmp/store', '-y', 'pkg'],
    );
  });

  it('sanitizeArgs strips quotes and empties', () => {
    assert.deepEqual(sanitizeArgs([' "a" ', '', " 'b' "]), ['a', 'b']);
  });

  it('normalizeServerEntry rejects disabled servers', () => {
    assert.equal(
      normalizeServerEntry('x', { enabled: false, command: 'npx' }),
      null,
    );
  });

  it('buildStdioEnv merges process.env with custom overrides', () => {
    const env = buildStdioEnv({ DOME_TEST_MCP: '1' });
    assert.equal(env.DOME_TEST_MCP, '1');
    assert.equal(typeof env.PATH, 'string');
  });
});

describe('mcp-client — callTool result normalization', () => {
  it('preserves text, images, structured content and tool errors', () => {
    const result = normalizeCallToolResult({ isError: true, structuredContent: { ok: false },
      content: [{ type: 'text', text: 'explanation' }, { type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' }] });
    assert.equal(result.isError, true);
    assert.equal(result.content[0].text, 'explanation');
    assert.equal(result.content[1].type, 'image');
    assert.deepEqual(result.details.structuredContent, { ok: false });
  });
  it('namespaces identical tool names and resolves normalized collisions', () => {
    assert.notEqual(exposedToolName('one', 'search'), exposedToolName('two', 'search'));
    assert.notEqual(exposedToolName('one', 'a.b', true), exposedToolName('one', 'a-b', true));
    assert.ok(exposedToolName('verylong'.repeat(20), 'tool').length <= 64);
  });
});

describe('mcp-client — no LangChain MCP adapters', () => {
  it('does not resolve @langchain/mcp-adapters or @langchain/langgraph', () => {
    assert.throws(() => require.resolve('@langchain/mcp-adapters'));
    assert.throws(() => require.resolve('@langchain/langgraph'));
  });
});

describe('mcp-client — testSingleMcpServer against mock stdio server', () => {
  it('lists tools from a minimal MCP stdio server', async () => {
    const mockPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      'fixtures',
      'mock-mcp-stdio-server.mjs',
    );

    // Ensure the mock script is runnable before connecting through the client.
    await new Promise((resolve, reject) => {
      const probe = spawn(process.execPath, ['--check', mockPath], { stdio: 'ignore' });
      probe.on('error', reject);
      probe.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`mock syntax check failed: ${code}`))));
    });

    const result = await testSingleMcpServer({
      name: 'mock',
      type: 'stdio',
      command: process.execPath,
      args: [mockPath],
    });

    assert.equal(result.success, true, result.error || 'expected success');
    assert.equal(result.toolCount, 1);
    assert.equal(result.tools[0].name, 'echo');
  });
});

const mockConfig = { name: 'paged', type: 'stdio', command: process.execPath,
  args: [fileURLToPath(new URL('./fixtures/mock-mcp-stdio-server.mjs', import.meta.url))], env: { DOME_TEST_PAGES: '1' } };
it('paginates, pools calls, preserves mixed errors and cancels requests', async () => {
  try {
    const { tools } = await loadToolsForServer(mockConfig);
    assert.equal(tools.length, 2);
    const inspect = tools.find((t) => t.originalName === 'inspect');
    const first = await inspect.invoke({});
    const second = await inspect.invoke({});
    assert.equal(first.details.structuredContent.pid, second.details.structuredContent.pid);
    assert.equal(first.isError, true);
    assert.equal(first.content[1].type, 'image');
    const controller = new AbortController();
    const pending = tools.find((t) => t.originalName === 'echo').invoke({ hang: true }, { signal: controller.signal });
    setTimeout(() => controller.abort(), 20);
    await assert.rejects(pending);
    assert.equal((await inspect.invoke({})).details.structuredContent.pid, first.details.structuredContent.pid);
  } finally { await closeAllMcpClients(); }
});
it('disabled dedicated rows cannot reactivate a legacy configuration', async () => {
  const tools = await getMCPTools({ getQueries: () => ({
    listMcpServers: { all: () => [{ name: 'disabled', enabled: 0 }] },
    getSetting: { get: () => ({ value: JSON.stringify([mockConfig]) }) },
  }) });
  assert.deepEqual(tools, []);
});
it('server failures do not hide healthy servers', async () => {
  try {
    const tools = await getMCPTools({ getQueries: () => ({
      listMcpServers: { all: () => [] },
      getSetting: { get: () => ({ value: JSON.stringify([{ name: 'broken', type: 'stdio', command: '/nonexistent/dome-mcp' }, mockConfig]) }) },
    }) });
    assert.equal(tools.length, 2);
  } finally { await closeAllMcpClients(); }
});

it('selects MCP tools by exact original or exposed name without enabling normalized collisions', () => {
  const tools = [{ originalName: 'a.b', name: exposedToolName('one', 'a.b', true) }, { originalName: 'a-b', name: exposedToolName('one', 'a-b', true) }];
  assert.deepEqual(filterToolsForServerPolicy(tools, { enabledToolIds: ['a.b'] }), [tools[0]]);
  assert.deepEqual(filterToolsForServerPolicy(tools, { enabledToolIds: [tools[1].name] }), [tools[1]]);
  assert.equal(filterToolsForServerPolicy(tools, { enabledToolIds: ['a_b'] }).length, 1);
});
