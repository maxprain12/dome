/* eslint-disable no-console */
/**
 * MCP Client - Main Process
 *
 * Connects to configured MCP servers and provides tools for the LangGraph agent.
 * Config is stored in dedicated SQLite tables.
 *
 * Format: [{ name, type: "stdio"|"http"|"sse", command?, args?, url?, headers? }]
 * - stdio: command (required), args (optional array)
 * - http: url (required), Streamable HTTP transport
 * - sse: url (required), SSE legacy transport
 */

const DEFAULT_MCP_SERVERS = [];

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
  const env = s.env && typeof s.env === 'object' && !Array.isArray(s.env)
    ? s.env
    : undefined;
  const headers = sanitizeHeaders(s.headers);
  const tools = Array.isArray(s.tools)
    ? s.tools
        .map((tool) => normalizeToolEntry(tool))
        .filter(Boolean)
    : undefined;
  const enabledToolIds = Array.isArray(s.enabledToolIds)
    ? s.enabledToolIds
        .map((toolId) => (typeof toolId === 'string' ? normalizeToolId(toolId) : ''))
        .filter(Boolean)
    : undefined;
  if ((s.type === 'sse' || s.transport === 'sse') && typeof s.url === 'string') {
    return {
      name: n,
      type: 'sse',
      url: s.url,
      headers,
      tools,
      enabledToolIds,
      lastDiscoveryAt: typeof s.lastDiscoveryAt === 'number' ? s.lastDiscoveryAt : undefined,
      lastDiscoveryError: typeof s.lastDiscoveryError === 'string' ? s.lastDiscoveryError : null,
    };
  }
  if ((s.type === 'http' || s.url) && typeof s.url === 'string') {
    return {
      name: n,
      type: 'http',
      url: s.url,
      headers,
      tools,
      enabledToolIds,
      lastDiscoveryAt: typeof s.lastDiscoveryAt === 'number' ? s.lastDiscoveryAt : undefined,
      lastDiscoveryError: typeof s.lastDiscoveryError === 'string' ? s.lastDiscoveryError : null,
    };
  }
  if ((s.type === 'stdio' || s.command) && typeof s.command === 'string') {
    return {
      name: n,
      type: 'stdio',
      command: s.command,
      args: sanitizeArgs(s.args),
      env,
      tools,
      enabledToolIds,
      lastDiscoveryAt: typeof s.lastDiscoveryAt === 'number' ? s.lastDiscoveryAt : undefined,
      lastDiscoveryError: typeof s.lastDiscoveryError === 'string' ? s.lastDiscoveryError : null,
    };
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
        .map((s) => s && typeof s.name === 'string' ? normalizeServerEntry(s.name, s) : null)
        .filter(Boolean)
        .filter(
          (s) =>
            (s.type === 'stdio' && s.command) ||
            (s.type === 'http' && s.url) ||
            (s.type === 'sse' && s.url),
        );
    }
    if (parsed && typeof parsed.mcpServers === 'object') {
      return Object.entries(parsed.mcpServers)
        .map(([k, v]) => normalizeServerEntry(k, v))
        .filter(Boolean)
        .filter(
          (s) =>
            (s.type === 'stdio' && s.command) ||
            (s.type === 'http' && s.url) ||
            (s.type === 'sse' && s.url),
        );
    }
    return DEFAULT_MCP_SERVERS;
  } catch (e) {
    console.warn('[MCP] Failed to parse mcp_servers config:', e?.message);
    return DEFAULT_MCP_SERVERS;
  }
}

/**
 * Build mcpServers object for MultiServerMCPClient from parsed config.
 * @param {Array} servers
 * @returns {Record<string, { transport?: string; command?: string; args?: string[]; url?: string; headers?: Record<string, string>; env?: Record<string, string> }>}
 */
function buildMcpServersObject(servers) {
  const out = {};
  for (const s of servers) {
    const key = String(s.name).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_') || `server_${Date.now()}`;
    if (s.type === 'stdio') {
      // Always merge process.env so the spawned MCP process inherits the full environment
      // (including the PATH enriched by fix-path on macOS GUI apps). Custom env vars override.
      const entry = {
        transport: 'stdio',
        command: s.command,
        args: sanitizeArgs(s.args),
        env: { ...process.env, ...(s.env || {}) },
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
  try {
    if (tool.schema && typeof tool.schema === 'object' && typeof tool.schema.toJSON === 'function') {
      inputSchema = tool.schema.toJSON();
    } else if (tool.schema && typeof tool.schema === 'object') {
      inputSchema = tool.schema;
    }
  } catch {
    inputSchema = undefined;
  }

  return {
    id: normalizeToolId(name),
    name,
    description: typeof tool.description === 'string' ? tool.description : '',
    inputSchema,
  };
}

async function createClientForServers(servers) {
  const mcpServers = buildMcpServersObject(servers);
  if (Object.keys(mcpServers).length === 0) {
    return null;
  }
  const { MultiServerMCPClient } = await import('@langchain/mcp-adapters');
  return new MultiServerMCPClient({
    mcpServers,
    throwOnLoadError: false,
    onConnectionError: 'ignore',
  });
}

async function loadToolsForServer(server) {
  const client = await createClientForServers([server]);
  if (!client) {
    return { tools: [], manifest: [] };
  }

  const tools = await client.getTools();
  const safeTools = Array.isArray(tools) ? tools : [];
  const manifest = safeTools
    .map((tool) => serializeTool(tool))
    .filter(Boolean);

  return { tools: safeTools, manifest };
}

/**
 * Get MCP tools from configured servers.
 * @param {object} database - Dome database module (with getQueries())
 * @param {string[]} [serverIds] - Optional. If provided, only include tools from servers whose name matches (case-insensitive).
 * @returns {Promise<import('@langchain/core/tools').StructuredToolInterface[]>}
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

  try {
    const allTools = [];
    for (const server of servers) {
      const { tools } = await loadToolsForServer(server);
      const enabledToolIds = getEnabledToolIdsForServer(server);
      if (!enabledToolIds || enabledToolIds.length === 0) {
        allTools.push(...tools);
        continue;
      }

      const enabledSet = new Set(enabledToolIds);
      const filteredTools = tools.filter((tool) => enabledSet.has(normalizeToolId(tool?.name)));
      allTools.push(...filteredTools);
    }
    return allTools;
  } catch (err) {
    console.warn('[MCP] Failed to load MCP tools:', err?.message);
    return [];
  }
}

/**
 * Test a single MCP server.
 * @param {object} server - { name, type, command?, args?, url?, env? }
 * @returns {Promise<{ success: boolean; toolCount: number; error?: string }>}
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
  parseMcpServersConfig,
  buildMcpServersObject,
  testSingleMcpServer,
};
