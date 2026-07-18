#!/usr/bin/env node
/**
 * Smoke: official MCP SDK client + transports must load without LangGraph.
 * Regression: packaged Dome failed when @langchain/mcp-adapters imported @langchain/langgraph.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRequire = createRequire(path.join(root, 'package.json'));

const { Client } = projectRequire('@modelcontextprotocol/sdk/client');
const { StdioClientTransport } = projectRequire('@modelcontextprotocol/sdk/client/stdio.js');
const { StreamableHTTPClientTransport } = projectRequire(
  '@modelcontextprotocol/sdk/client/streamableHttp.js',
);
const { SSEClientTransport } = projectRequire('@modelcontextprotocol/sdk/client/sse.js');

assert.ok(typeof Client === 'function', 'Client missing');
assert.ok(typeof StdioClientTransport === 'function', 'StdioClientTransport missing');
assert.ok(typeof StreamableHTTPClientTransport === 'function', 'StreamableHTTPClientTransport missing');
assert.ok(typeof SSEClientTransport === 'function', 'SSEClientTransport missing');

let adaptersResolved = false;
try {
  require.resolve('@langchain/mcp-adapters');
  adaptersResolved = true;
} catch {
  adaptersResolved = false;
}
assert.equal(adaptersResolved, false, '@langchain/mcp-adapters must not be a dependency');

let langgraphResolved = false;
try {
  require.resolve('@langchain/langgraph');
  langgraphResolved = true;
} catch {
  langgraphResolved = false;
}
assert.equal(langgraphResolved, false, '@langchain/langgraph must not be required for MCP');

console.log('[smoke-mcp-sdk] OK — Client + stdio/http/sse transports (no langgraph)');
