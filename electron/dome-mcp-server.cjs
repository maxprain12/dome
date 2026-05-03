/* eslint-disable no-console */
'use strict';

/**
 * Dome MCP Server — exposes all Dome tools via Streamable HTTP transport.
 *
 * External clients (Cursor, Claude Desktop, etc.) connect to
 * http://127.0.0.1:<port>/mcp and call tools just like Many does internally.
 * Each client is identified by its MCP `clientInfo.name` field sent during
 * the initialize handshake.
 */

const http = require('http');
const { randomUUID } = require('crypto');

// Lazy-loaded so startup is unaffected if @modelcontextprotocol/sdk is absent.
let McpServer, StreamableHTTPServerTransport, ListToolsRequestSchema, CallToolRequestSchema;
try {
  ({ Server: McpServer } = require('@modelcontextprotocol/sdk/server'));
  ({ StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js'));
  ({ ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js'));
} catch (e) {
  console.error('[DomeMCP] Failed to load @modelcontextprotocol/sdk:', e.message);
}

let toolDispatcher;
try {
  toolDispatcher = require('./tool-dispatcher.cjs');
} catch (e) {
  console.error('[DomeMCP] Failed to load tool-dispatcher:', e.message);
}

/** @type {http.Server | null} */
let httpServer = null;
let listenPort = 37214;

/**
 * Active sessions: sessionId → { transport, server, clientName }
 * @type {Map<string, { transport: any, server: any, clientName: string }>}
 */
const sessions = new Map();

// ---------------------------------------------------------------------------
// Tool helpers
// ---------------------------------------------------------------------------

/** Convert OpenAI-style tool defs to MCP ListTools format. */
function getMcpTools() {
  if (!toolDispatcher) return [];
  return toolDispatcher.getAllToolDefinitions().map((def) => ({
    name: def.function.name,
    description: def.function.description || '',
    inputSchema: def.function.parameters || { type: 'object', properties: {} },
  }));
}

/** Create a new MCP Server instance wired to the given session info. */
function buildMcpServer(sessionInfo) {
  if (!McpServer || !ListToolsRequestSchema || !CallToolRequestSchema) return null;

  const server = new McpServer(
    { name: 'dome', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: getMcpTools(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const client = sessionInfo.clientName || 'external';
    console.log(`[DomeMCP][${client}] call: ${name}`);

    if (!toolDispatcher) {
      return { content: [{ type: 'text', text: 'Tool dispatcher unavailable' }], isError: true };
    }
    try {
      const result = await toolDispatcher.executeToolInMain(name, args || {});
      const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      return { content: [{ type: 'text', text }] };
    } catch (err) {
      return { content: [{ type: 'text', text: err?.message || 'Tool error' }], isError: true };
    }
  });

  return server;
}

// ---------------------------------------------------------------------------
// HTTP request handling
// ---------------------------------------------------------------------------

/** Read and JSON-parse the request body. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) { resolve(undefined); return; }
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

async function handleRequest(req, res) {
  // CORS — allow any origin so browser-based clients work
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (!req.url?.startsWith('/mcp')) {
    res.writeHead(404);
    return res.end('Not found');
  }

  const sessionId = req.headers['mcp-session-id'];

  // DELETE — close a specific session
  if (req.method === 'DELETE' && sessionId) {
    const session = sessions.get(sessionId);
    if (session) {
      try { await session.transport.close(); } catch {}
      sessions.delete(sessionId);
    }
    res.writeHead(200);
    return res.end();
  }

  // GET — SSE stream for an existing session
  if (req.method === 'GET') {
    if (!sessionId || !sessions.has(sessionId)) {
      res.writeHead(404);
      return res.end('Session not found');
    }
    const session = sessions.get(sessionId);
    await session.transport.handleRequest(req, res);
    return;
  }

  // POST — new session (initialize) or existing session message
  if (req.method === 'POST') {
    let body;
    try {
      body = await readBody(req);
    } catch {
      res.writeHead(400);
      return res.end('Invalid JSON body');
    }

    // Route to existing session
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId);
      await session.transport.handleRequest(req, res, body);
      return;
    }

    // New session — must begin with initialize
    if (body?.method !== 'initialize') {
      const reqId = body && typeof body === 'object' && 'id' in body ? body.id : null;
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: reqId,
          error: { code: -32600, message: 'Expected initialize for new session' },
        }),
      );
    }

    if (!StreamableHTTPServerTransport || !McpServer) {
      res.writeHead(503);
      return res.end('MCP SDK unavailable');
    }

    const clientName = body?.params?.clientInfo?.name || 'external';
    console.log(`[DomeMCP] New session from: ${clientName}`);

    const sessionInfo = { clientName };
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      // Stdio bridge (dome-mcp-bridge.cjs) expects one JSON-RPC object per POST — not SSE.
      enableJsonResponse: true,
    });

    const server = buildMcpServer(sessionInfo);
    if (!server) {
      res.writeHead(503);
      return res.end('MCP server build failed');
    }

    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
        console.log(`[DomeMCP] Session closed: ${transport.sessionId} [${clientName}]`);
      }
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, body);

    if (transport.sessionId) {
      sessionInfo.transport = transport;
      sessionInfo.server = server;
      sessions.set(transport.sessionId, sessionInfo);
      console.log(`[DomeMCP] Session opened: ${transport.sessionId} [${clientName}]`);
    }
    return;
  }

  res.writeHead(405);
  res.end('Method Not Allowed');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function start(port) {
  if (httpServer) {
    return Promise.resolve({ success: true, port: listenPort, alreadyRunning: true });
  }

  listenPort = Number(port) || 37214;

  return new Promise((resolve) => {
    httpServer = http.createServer(handleRequest);

    httpServer.listen(listenPort, '127.0.0.1', () => {
      console.log(`[DomeMCP] Listening on http://127.0.0.1:${listenPort}/mcp`);
      resolve({ success: true, port: listenPort });
    });

    httpServer.on('error', (err) => {
      console.error('[DomeMCP] Server error:', err.message);
      httpServer = null;
      resolve({ success: false, error: err.message });
    });
  });
}

function stop() {
  return new Promise((resolve) => {
    if (!httpServer) {
      resolve({ success: true });
      return;
    }
    for (const [id, session] of sessions) {
      try { session.transport.close(); } catch {}
      sessions.delete(id);
    }
    httpServer.close(() => {
      console.log('[DomeMCP] Stopped');
      httpServer = null;
      resolve({ success: true });
    });
  });
}

function getStatus() {
  return {
    running: httpServer !== null,
    port: httpServer ? listenPort : null,
    sessions: Array.from(sessions.values()).map((s) => ({
      clientName: s.clientName,
    })),
  };
}

module.exports = { start, stop, getStatus };
