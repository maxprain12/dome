/* eslint-disable no-console */
/**
 * MCP Client - Main Process
 *
 * Connects to configured MCP servers and provides tools for the LangGraph agent.
 * Config is stored in settings as mcp_servers (JSON array).
 *
 * Format: [{ name, type: "stdio"|"http", command?, args?, url? }]
 * - stdio: command (required), args (optional array)
 * - http: url (required)
 */

const DEFAULT_MCP_SERVERS = [];

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
 * Normalize a single server entry to our format.
 * @param {string} name - Server name (key)
 * @param {object} s - Server config (from mcpServers or our array)
 * @returns {{ name: string; type: string; command?: string; args?: string[]; url?: string; env?: Record<string, string> }|null}
 */
function normalizeServerEntry(name, s) {
  if (!s || typeof s !== 'object') return null;
  const n = String(name || '').trim();
  if (!n) return null;
  const env = s.env && typeof s.env === 'object' && !Array.isArray(s.env)
    ? s.env
    : undefined;
  if ((s.type === 'http' || s.url) && typeof s.url === 'string') {
    return { name: n, type: 'http', url: s.url };
  }
  if ((s.type === 'stdio' || s.command) && typeof s.command === 'string') {
    return {
      name: n,
      type: 'stdio',
      command: s.command,
      args: sanitizeArgs(s.args),
      env,
    };
  }
  return null;
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
            (s.type === 'stdio' && s.command) || (s.type === 'http' && s.url),
        );
    }
    if (parsed && typeof parsed.mcpServers === 'object') {
      return Object.entries(parsed.mcpServers)
        .map(([k, v]) => normalizeServerEntry(k, v))
        .filter(Boolean)
        .filter(
          (s) =>
            (s.type === 'stdio' && s.command) || (s.type === 'http' && s.url),
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
 * @returns {Record<string, { transport?: string; command?: string; args?: string[]; url?: string; env?: Record<string, string> }>}
 */
function buildMcpServersObject(servers) {
  const out = {};
  for (const s of servers) {
    const key = String(s.name).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_') || `server_${Date.now()}`;
    if (s.type === 'stdio') {
      const entry = {
        transport: 'stdio',
        command: s.command,
        args: sanitizeArgs(s.args),
      };
      if (s.env && typeof s.env === 'object' && Object.keys(s.env).length > 0) {
        entry.env = { ...process.env, ...s.env };
      }
      out[key] = entry;
    } else if (s.type === 'http' && s.url) {
      out[key] = {
        transport: 'sse',
        url: s.url,
      };
    }
  }
  return out;
}

/**
 * Get MCP tools from configured servers.
 * @param {object} database - Dome database module (with getQueries())
 * @returns {Promise<import('@langchain/core/tools').StructuredToolInterface[]>}
 */
async function getMCPTools(database) {
  const queries = database?.getQueries?.();
  if (!queries) return [];

  const row = queries.getSetting?.get?.('mcp_servers');
  const raw = row?.value;
  const servers = parseMcpServersConfig(raw);
  if (servers.length === 0) return [];

  const mcpServers = buildMcpServersObject(servers);
  if (Object.keys(mcpServers).length === 0) return [];

  try {
    const { MultiServerMCPClient } = await import('@langchain/mcp-adapters');
    const client = new MultiServerMCPClient({
      mcpServers,
      throwOnLoadError: false,
      onConnectionError: 'ignore',
    });
    const tools = await client.getTools();
    return Array.isArray(tools) ? tools : [];
  } catch (err) {
    console.warn('[MCP] Failed to load MCP tools:', err?.message);
    return [];
  }
}

module.exports = {
  getMCPTools,
  parseMcpServersConfig,
  buildMcpServersObject,
};
