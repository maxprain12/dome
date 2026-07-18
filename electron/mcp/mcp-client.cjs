/* eslint-disable no-console */
/**
 * MCP Client - Main Process
 *
 * Connects to configured MCP servers via the official @modelcontextprotocol/sdk
 * and provides tools for the agent runtime. Config is stored in dedicated SQLite tables.
 *
 * Format: [{ name, type: "stdio"|"http"|"sse", command?, args?, url?, headers? }]
 * - stdio: command (required), args (optional array)
 * - http: url (required), Streamable HTTP transport
 * - sse: url (required), SSE legacy transport
 */

'use strict';

const { createRequire } = require('module');
const { getPackageJsonPath } = require('../paths.cjs');
const { capToolResultString, getCapForTool, safeStringify } = require('../tools/tool-result-cap.cjs');
const {
  isMcpToolDisabledByDefault,
  normalizeMcpId,
} = require('./mcp-tool-policy.cjs');

/** Resolve MCP SDK anchored to Dome's package.json (Electron + pnpm-safe). */
const projectRequire = createRequire(getPackageJsonPath());

const DEFAULT_MCP_SERVERS = [];
const MCP_SERVER_LOAD_TIMEOUT_MS = 25_000;
const MCP_TOOLS_CACHE_TTL_MS = 5 * 60 * 1000;
const CLIENT_INFO = { name: 'dome', version: '1.0.0' };

/**
 * @returns {{
 *   Client: typeof import('@modelcontextprotocol/sdk/client').Client,
 *   StdioClientTransport: new (opts: object) => object,
 *   StreamableHTTPClientTransport: new (url: URL, opts?: object) => object,
 *   SSEClientTransport: new (url: URL, opts?: object) => object,
 * }}
 */
function loadMcpSdk() {
  const { Client } = projectRequire('@modelcontextprotocol/sdk/client');
  const { StdioClientTransport } = projectRequire('@modelcontextprotocol/sdk/client/stdio.js');
  const { StreamableHTTPClientTransport } = projectRequire(
    '@modelcontextprotocol/sdk/client/streamableHttp.js',
  );
  const { SSEClientTransport } = projectRequire('@modelcontextprotocol/sdk/client/sse.js');
  return { Client, StdioClientTransport, StreamableHTTPClientTransport, SSEClientTransport };
}

function normalizeServerId(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function normalizeToolId(name) {
  return normalizeServerId(name);
}

/**
 * Sanitize args: strip quotes/spaces, filter empty.
 * @param {string[]|unknown} args
 * @returns {string[]}
 */
function sanitizeArgs(args) {
  if (!Array.isArray(args)) return [];
  return args
    .map((a) => String(a).trim().replace(/^["'\s,]+|["'\s,]+$/g, ''))
    .filter(Boolean);
}

/**
 * Drop orphan Node/MCP flags (e.g. `--localstorage-file` without a path) that spawn warnings.
 * @param {string[]} args
 * @returns {string[]}
 */
function sanitizeMcpStdioArgs(args) {
  const cleaned = sanitizeArgs(args);
  const out = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    const a = cleaned[i];
    if (a === '--localstorage-file' || a === '--local-storage-file') {
      const next = cleaned[i + 1];
      if (next && !next.startsWith('-')) {
        out.push(a, next);
        i += 1;
      }
      continue;
    }
    out.push(a);
  }
  return out;
}

/**
 * Normalize headers to Record<string, string>.
 * @param {unknown} h
 * @returns {Record<string, string>|undefined}
 */
function sanitizeHeaders(h) {
  if (!h || typeof h !== 'object' || Array.isArray(h)) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(h)) {
    if (typeof k === 'string' && typeof v === 'string') out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Stdio env must be Record<string, string> (no undefined).
 * @param {Record<string, unknown>|undefined} custom
 * @returns {Record<string, string>}
 */
function buildStdioEnv(custom) {
  const out = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string') out[k] = v;
  }
  if (custom && typeof custom === 'object' && !Array.isArray(custom)) {
    for (const [k, v] of Object.entries(custom)) {
      if (typeof k === 'string' && v != null) out[k] = String(v);
    }
  }
  return out;
}

function pickDiscoveryFields(s) {
  return {
    lastDiscoveryAt: typeof s.lastDiscoveryAt === 'number' ? s.lastDiscoveryAt : undefined,
    lastDiscoveryError: typeof s.lastDiscoveryError === 'string' ? s.lastDiscoveryError : null,
  };
}

function pickToolList(s) {
  return Array.isArray(s.tools)
    ? s.tools.map((tool) => normalizeToolEntry(tool)).filter(Boolean)
    : undefined;
}

function pickEnabledToolIds(s) {
  return Array.isArray(s.enabledToolIds)
    ? s.enabledToolIds
      .map((toolId) => (typeof toolId === 'string' ? normalizeToolId(toolId) : ''))
      .filter(Boolean)
    : undefined;
}

function pickEnv(s) {
  return s.env && typeof s.env === 'object' && !Array.isArray(s.env) ? s.env : undefined;
}

function buildSseEntry(n, s, headers, tools, enabledToolIds) {
  return {
    name: n,
    type: 'sse',
    url: s.url,
    headers,
    tools,
    enabledToolIds,
    ...pickDiscoveryFields(s),
  };
}

function buildHttpEntry(n, s, headers, tools, enabledToolIds) {
  return {
    name: n,
    type: 'http',
    url: s.url,
    headers,
    tools,
    enabledToolIds,
    ...pickDiscoveryFields(s),
  };
}

function buildStdioEntry(n, s, env, tools, enabledToolIds) {
  return {
    name: n,
    type: 'stdio',
    command: s.command,
    args: sanitizeArgs(s.args),
    env,
    tools,
    enabledToolIds,
    ...pickDiscoveryFields(s),
  };
}

/**
 * Normalize a single server entry to our format.
 * @param {string} name - Server name (key)
 * @param {object} s - Server config (from mcpServers or our array)
 * @returns {{ name: string; type: string; command?: string; args?: string[]; url?: string; headers?: Record<string, string>; env?: Record<string, string> }|null}
 */
function normalizeServerEntry(name, s) {
  if (!s || typeof s !== 'object') return null;
  const n = String(name || '').trim();
  if (!n) return null;
  if (s.enabled === false) return null;
  const env = pickEnv(s);
  const headers = sanitizeHeaders(s.headers);
  const tools = pickToolList(s);
  const enabledToolIds = pickEnabledToolIds(s);
  if ((s.type === 'sse' || s.transport === 'sse') && typeof s.url === 'string') {
    return buildSseEntry(n, s, headers, tools, enabledToolIds);
  }
  if ((s.type === 'http' || s.url) && typeof s.url === 'string') {
    return buildHttpEntry(n, s, headers, tools, enabledToolIds);
  }
  if ((s.type === 'stdio' || s.command) && typeof s.command === 'string') {
    return buildStdioEntry(n, s, env, tools, enabledToolIds);
  }
  return null;
}

function normalizeToolEntry(tool) {
  if (!tool || typeof tool !== 'object') return null;
  const name = typeof tool.name === 'string'
    ? tool.name.trim()
    : typeof tool.id === 'string'
      ? tool.id.trim()
      : '';
  if (!name) return null;
  return {
    id: typeof tool.id === 'string' && tool.id.trim()
      ? normalizeToolId(tool.id)
      : normalizeToolId(name),
    name,
    description: typeof tool.description === 'string' && tool.description.trim()
      ? tool.description
      : '',
    inputSchema: tool.inputSchema && typeof tool.inputSchema === 'object' && !Array.isArray(tool.inputSchema)
      ? tool.inputSchema
      : undefined,
    enabled: tool.enabled !== false,
  };
}

function safeParseJson(raw, fallback) {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function deserializeMcpServerRow(row) {
  if (!row) return null;
  return normalizeServerEntry(row.name, {
    type: row.type,
    command: row.command,
    args: safeParseJson(row.args_json, []),
    url: row.url,
    headers: safeParseJson(row.headers_json, undefined),
    env: safeParseJson(row.env_json, undefined),
    tools: safeParseJson(row.tools_json, undefined),
    enabledToolIds: safeParseJson(row.enabled_tool_ids_json, undefined),
    lastDiscoveryAt: row.last_discovery_at,
    lastDiscoveryError: row.last_discovery_error,
    enabled: row.enabled !== 0,
  });
}

/**
 * Parse MCP servers config from settings value.
 * Accepts both:
 * - Array: [{ name, type, command?, args?, url?, env? }]
 * - Object: { mcpServers: { "server-name": { command, args, env?, url? } } }
 * @param {string|undefined} raw - JSON string from db
 * @returns {Array<{ name: string; type: string; command?: string; args?: string[]; url?: string; env?: Record<string, string> }>}
 */
function parseMcpServersConfig(raw) {
  if (!raw || typeof raw !== 'string') return DEFAULT_MCP_SERVERS;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((s) => (s && typeof s.name === 'string' ? normalizeServerEntry(s.name, s) : null))
        .filter(Boolean)
        .filter(
          (s) =>
            (s.type === 'stdio' && s.command)
            || (s.type === 'http' && s.url)
            || (s.type === 'sse' && s.url),
        );
    }
    if (parsed && typeof parsed.mcpServers === 'object') {
      return Object.entries(parsed.mcpServers)
        .map(([k, v]) => normalizeServerEntry(k, v))
        .filter(Boolean)
        .filter(
          (s) =>
            (s.type === 'stdio' && s.command)
            || (s.type === 'http' && s.url)
            || (s.type === 'sse' && s.url),
        );
    }
    return DEFAULT_MCP_SERVERS;
  } catch (e) {
    console.warn('[MCP] Failed to parse mcp_servers config:', e?.message);
    return DEFAULT_MCP_SERVERS;
  }
}

/**
 * Build a transport-config object from parsed servers (used by tests / diagnostics).
 * @param {Array} servers
 * @returns {Record<string, { transport?: string; command?: string; args?: string[]; url?: string; headers?: Record<string, string>; env?: Record<string, string> }>}
 */
function buildMcpServersObject(servers) {
  const out = {};
  for (const s of servers) {
    const key = String(s.name).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_') || `server_${Date.now()}`;
    if (s.type === 'stdio') {
      const entry = {
        transport: 'stdio',
        command: s.command,
        args: sanitizeMcpStdioArgs(s.args),
        env: buildStdioEnv(s.env),
      };
      out[key] = entry;
    } else if (s.type === 'http' && s.url) {
      const entry = { transport: 'http', url: s.url };
      if (s.headers && typeof s.headers === 'object' && Object.keys(s.headers).length > 0) {
        entry.headers = s.headers;
      }
      out[key] = entry;
    } else if (s.type === 'sse' && s.url) {
      const entry = { transport: 'sse', url: s.url };
      if (s.headers && typeof s.headers === 'object' && Object.keys(s.headers).length > 0) {
        entry.headers = s.headers;
      }
      out[key] = entry;
    }
  }
  return out;
}

function getEnabledToolIdsForServer(server) {
  if (Array.isArray(server?.enabledToolIds) && server.enabledToolIds.length > 0) {
    return server.enabledToolIds
      .map((toolId) => normalizeToolId(toolId))
      .filter(Boolean);
  }
  if (Array.isArray(server?.tools) && server.tools.length > 0) {
    return server.tools
      .filter((tool) => tool?.enabled !== false)
      .map((tool) => normalizeToolId(tool.id || tool.name))
      .filter(Boolean);
  }
  return null;
}

function serializeTool(tool) {
  if (!tool || typeof tool !== 'object') return null;
  const name = typeof tool.name === 'string' ? tool.name.trim() : '';
  if (!name) return null;

  let inputSchema;
  if (tool.schema && typeof tool.schema === 'object' && !Array.isArray(tool.schema)) {
    inputSchema = tool.schema;
  } else if (tool.inputSchema && typeof tool.inputSchema === 'object' && !Array.isArray(tool.inputSchema)) {
    inputSchema = tool.inputSchema;
  }

  return {
    id: normalizeToolId(name),
    name,
    description: typeof tool.description === 'string' ? tool.description : '',
    inputSchema,
  };
}

/**
 * @param {object} server
 * @returns {Promise<{ client: object, close: () => Promise<void> }>}
 */
async function connectMcpServer(server) {
  const {
    Client,
    StdioClientTransport,
    StreamableHTTPClientTransport,
    SSEClientTransport,
  } = loadMcpSdk();

  const client = new Client(CLIENT_INFO);
  let transport;

  if (server.type === 'stdio') {
    transport = new StdioClientTransport({
      command: server.command,
      args: sanitizeMcpStdioArgs(server.args),
      env: buildStdioEnv(server.env),
      stderr: 'pipe',
    });
  } else if (server.type === 'http' && server.url) {
    const opts = {};
    if (server.headers && Object.keys(server.headers).length > 0) {
      opts.requestInit = { headers: server.headers };
    }
    transport = new StreamableHTTPClientTransport(new URL(server.url), opts);
  } else if (server.type === 'sse' && server.url) {
    const opts = {};
    if (server.headers && Object.keys(server.headers).length > 0) {
      opts.requestInit = { headers: server.headers };
    }
    transport = new SSEClientTransport(new URL(server.url), opts);
  } else {
    throw new Error(`Unsupported MCP server type: ${server?.type || 'unknown'}`);
  }

  await client.connect(transport);
  return {
    client,
    close: async () => {
      try {
        await client.close();
      } catch (err) {
        console.warn(`[MCP] Failed to close client for ${server?.name || 'server'}:`, err?.message || err);
      }
    },
  };
}

/**
 * @template T
 * @param {object} server
 * @param {(client: object) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withMcpClient(server, fn) {
  const { client, close } = await connectMcpServer(server);
  try {
    return await fn(client);
  } finally {
    await close();
  }
}

/**
 * Normalize MCP callTool result into a value suitable for agent tool state.
 * @param {unknown} result
 * @returns {unknown}
 */
function normalizeCallToolResult(result) {
  if (result == null) return '';
  if (typeof result !== 'object') return result;

  const structured = /** @type {{ structuredContent?: unknown, content?: unknown[], toolResult?: unknown, isError?: boolean }} */ (result);
  if (structured.structuredContent != null) {
    return structured.structuredContent;
  }
  if (structured.toolResult != null) {
    return structured.toolResult;
  }
  if (Array.isArray(structured.content)) {
    const texts = structured.content
      .filter((part) => part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text);
    if (texts.length === 1) return texts[0];
    if (texts.length > 1) return texts.join('\n');
    return structured.content;
  }
  return result;
}

/**
 * @param {object} server
 * @param {{ name: string, description?: string, inputSchema?: object }} toolDef
 * @returns {{ name: string, description: string, schema: object, invoke: (input?: unknown, config?: { signal?: AbortSignal }) => Promise<string> }}
 */
function createNativeMcpTool(server, toolDef) {
  const name = typeof toolDef.name === 'string' ? toolDef.name.trim() : 'mcp_tool';
  const description = typeof toolDef.description === 'string' ? toolDef.description : '';
  const schema = toolDef.inputSchema && typeof toolDef.inputSchema === 'object' && !Array.isArray(toolDef.inputSchema)
    ? toolDef.inputSchema
    : { type: 'object', properties: {} };

  return {
    name,
    description,
    schema,
    async invoke(input, config) {
      const args = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
      const signal = config?.signal;
      const out = await withMcpClient(server, async (client) => {
        const result = await client.callTool(
          { name, arguments: args },
          undefined,
          signal ? { signal } : undefined,
        );
        return normalizeCallToolResult(result);
      });
      const text = safeStringify(out ?? '');
      return capToolResultString(name, text, { maxChars: getCapForTool(name) });
    },
  };
}

/**
 * @param {Array<{ name?: string, schema?: object, invoke?: Function }>} tools
 * @param {{ name?: string; command?: string; args?: string[]; enabledToolIds?: string[] }} server
 * @returns {typeof tools}
 */
function filterToolsForServerPolicy(tools, server) {
  if (!Array.isArray(tools)) return [];
  const enabledSet = Array.isArray(server?.enabledToolIds) && server.enabledToolIds.length > 0
    ? new Set(server.enabledToolIds.map((id) => normalizeMcpId(id)))
    : null;

  return tools.filter((tool) => {
    const id = normalizeMcpId(tool?.name);
    if (isMcpToolDisabledByDefault(id, server)) {
      return enabledSet?.has(id) ?? false;
    }
    if (enabledSet) return enabledSet.has(id);
    return true;
  });
}

/** @type {{ key: string; tools: Array<{ name: string, description: string, schema: object, invoke: Function }>; at: number } | null} */
let mcpToolsCache = null;

function mcpCacheKey(serverIds) {
  if (!serverIds || serverIds.length === 0) return '__all__';
  return [...serverIds].map((id) => String(id).trim().toLowerCase()).sort((a, b) => a.localeCompare(b)).join('|');
}

function invalidateMcpToolsCache() {
  mcpToolsCache = null;
}

/** Best-effort: drop cached tool handles (stdio clients are closed per discovery/invoke). */
function closeAllMcpClients() {
  invalidateMcpToolsCache();
}

async function loadToolsForServer(server) {
  const loadPromise = (async () => {
    const listed = await withMcpClient(server, async (client) => {
      const result = await client.listTools();
      return Array.isArray(result?.tools) ? result.tools : [];
    });

    const safeTools = listed.map((toolDef) => createNativeMcpTool(server, toolDef));
    const manifest = safeTools.map((tool) => serializeTool(tool)).filter(Boolean);
    return { tools: safeTools, manifest };
  })();

  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(`[MCP] ${server?.name || 'server'} tool load timed out after ${MCP_SERVER_LOAD_TIMEOUT_MS}ms`);
      resolve({ tools: [], manifest: [] });
    }, MCP_SERVER_LOAD_TIMEOUT_MS);
  });

  try {
    return await Promise.race([loadPromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get MCP tools from configured servers.
 * @param {object} database - Dome database module (with getQueries())
 * @param {string[]} [serverIds] - Optional. If provided, only include tools from servers whose name matches (case-insensitive).
 * @returns {Promise<Array<{ name: string, description: string, schema: object, invoke: Function }>>}
 */
async function getMCPTools(database, serverIds) {
  const queries = database?.getQueries?.();
  if (!queries) return [];

  const mcpEnabledRow = queries.getMcpGlobalSettings?.get?.();
  if (mcpEnabledRow && mcpEnabledRow.enabled === 0) return [];

  const rows = queries.listMcpServers?.all?.() ?? [];
  let servers = rows.map((row) => deserializeMcpServerRow(row)).filter(Boolean);
  if (servers.length === 0) {
    const row = queries.getSetting?.get?.('mcp_servers');
    const raw = row?.value;
    servers = parseMcpServersConfig(raw);
  }
  if (servers.length === 0) return [];

  if (serverIds && serverIds.length > 0) {
    const idSet = new Set(serverIds.map((id) => String(id).trim().toLowerCase()));
    servers = servers.filter((s) => idSet.has(String(s.name || '').trim().toLowerCase()));
    if (servers.length === 0) return [];
  }

  const cacheKey = mcpCacheKey(serverIds);
  if (
    mcpToolsCache
    && mcpToolsCache.key === cacheKey
    && Date.now() - mcpToolsCache.at < MCP_TOOLS_CACHE_TTL_MS
  ) {
    return mcpToolsCache.tools;
  }

  try {
    const allTools = [];
    for (const server of servers) {
      const { tools } = await loadToolsForServer(server);
      const policyFiltered = filterToolsForServerPolicy(tools, server);
      const enabledToolIds = getEnabledToolIdsForServer(server);
      if (!enabledToolIds || enabledToolIds.length === 0) {
        allTools.push(...policyFiltered);
        continue;
      }

      const enabledSet = new Set(enabledToolIds);
      const filteredTools = policyFiltered.filter((tool) => enabledSet.has(normalizeToolId(tool?.name)));
      allTools.push(...filteredTools);
    }
    mcpToolsCache = { key: cacheKey, tools: allTools, at: Date.now() };
    return allTools;
  } catch (err) {
    console.warn('[MCP] Failed to load MCP tools:', err?.message);
    return [];
  }
}

/**
 * Test a single MCP server.
 * @param {object} server - { name, type, command?, args?, url?, env? }
 * @returns {Promise<{ success: boolean; toolCount: number; tools?: object[]; error?: string }>}
 */
async function testSingleMcpServer(server) {
  if (!server || !server.name) {
    return { success: false, toolCount: 0, tools: [], error: 'Config inválida' };
  }
  const normalized = normalizeServerEntry(server.name, server);
  if (!normalized) {
    return { success: false, toolCount: 0, tools: [], error: 'Servidor no configurado correctamente' };
  }
  try {
    const { manifest } = await loadToolsForServer(normalized);
    return {
      success: true,
      toolCount: manifest.length,
      tools: manifest,
    };
  } catch (err) {
    return {
      success: false,
      toolCount: 0,
      tools: [],
      error: err?.message || String(err),
    };
  }
}

module.exports = {
  getMCPTools,
  invalidateMcpToolsCache,
  closeAllMcpClients,
  parseMcpServersConfig,
  buildMcpServersObject,
  testSingleMcpServer,
  // Exported for unit tests
  normalizeServerEntry,
  sanitizeMcpStdioArgs,
  sanitizeArgs,
  buildStdioEnv,
  normalizeCallToolResult,
};
