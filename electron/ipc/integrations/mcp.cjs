/* eslint-disable no-console */
/**
 * IPC handlers for MCP (Model Context Protocol) settings and testing.
 */
const { parseMcpServersConfig, testSingleMcpServer } = require('../../mcp/mcp-client.cjs');
const mcpOauth = require('../../mcp/mcp-oauth.cjs');

function register({ ipcMain, windowManager, database, validateSender }) {
  /**
   * Test MCP connection - loads tools from configured servers.
   * Returns success, tool count, and optional error.
   */
  ipcMain.handle('mcp:testConnection', async (event) => {
    try {
      validateSender(event, windowManager);
    } catch (err) {
      console.warn('[MCP] Unauthorized:', err?.message);
      return { success: false, toolCount: 0, error: 'Unauthorized' };
    }
    try {
      const queries = database.getQueries();
      if (queries.getMcpGlobalSettings.get()?.enabled === 0) throw new Error('MCP is disabled');
      const rows = queries.listMcpServers.all();
      const configs = rows.length ? rows.filter((r) => r.enabled !== 0).map((r) => ({
        name: r.name, type: r.type, command: r.command, url: r.url,
        args: JSON.parse(r.args_json || '[]'), headers: JSON.parse(r.headers_json || '{}'), env: JSON.parse(r.env_json || '{}'),
      })) : parseMcpServersConfig(queries.getSetting.get('mcp_servers')?.value);
      const results = await Promise.all(configs.map(async (server) => ({ server: server.name, ...await testSingleMcpServer(server) })));
      const failed = results.filter((r) => !r.success);
      return { success: configs.length > 0 && failed.length === 0, toolCount: results.reduce((n, r) => n + r.toolCount, 0),
        results, error: failed.map((r) => `${r.server}: ${r.error}`).join('; ') || (configs.length ? undefined : 'No enabled MCP servers') };
    } catch (err) {
      console.warn('[MCP] Test connection failed:', err?.message);
      return {
        success: false,
        toolCount: 0,
        error: err?.message || String(err),
      };
    }
  });

  /**
   * Test a single MCP server.
   * Receives server config: { name, type, command?, args?, url?, env? }
   */
  ipcMain.handle('mcp:testServer', async (event, server) => {
    try {
      validateSender(event, windowManager);
    } catch (err) {
      console.warn('[MCP] Unauthorized:', err?.message);
      return { success: false, toolCount: 0, error: 'Unauthorized' };
    }
    try {
      return await testSingleMcpServer(server);
    } catch (err) {
      console.warn('[MCP] Test server failed:', err?.message);
      return {
        success: false,
        toolCount: 0,
        error: err?.message || String(err),
      };
    }
  });

  /**
   * Start OAuth flow: opens browser, captures token via dome:// callback.
   * providerId: 'neon' | etc.
   * Returns { success, token?, error? }
   */
  ipcMain.handle('mcp:startOAuthFlow', async (event, providerId) => {
    try {
      validateSender(event, windowManager);
    } catch (err) {
      console.warn('[MCP OAuth] Unauthorized:', err?.message);
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const result = await mcpOauth.startOAuthFlow(providerId, database);
      return { success: true, connected: result.connected };
    } catch (err) {
      console.warn('[MCP OAuth] Flow failed:', err?.message);
      return { success: false, error: err?.message || String(err) };
    }
  });

  /**
   * Get OAuth-supported MCP providers
   */
  ipcMain.handle('mcp:getOAuthProviders', async (event) => {
    try {
      validateSender(event, windowManager);
    } catch (err) {
      console.warn('[MCP] Unauthorized:', err?.message);
      return { success: false, providers: [], error: 'Unauthorized' };
    }
    try {
      return { success: true, providers: mcpOauth.getSupportedProviders(database) };
    } catch (err) {
      console.warn('[MCP] Get OAuth providers failed:', err?.message);
      return { success: false, providers: [], error: err?.message || String(err) };
    }
  });
}

module.exports = { register };
