/* eslint-disable no-console */
/**
 * IPC handlers for MCP (Model Context Protocol) settings and testing.
 */
const { getMCPTools, testSingleMcpServer } = require('../mcp-client.cjs');
const mcpOauth = require('../mcp-oauth.cjs');

function register({ ipcMain, windowManager, database, validateSender }) {
  /**
   * Test MCP connection - loads tools from configured servers.
   * Returns success, tool count, and optional error.
   */
  ipcMain.handle('mcp:testConnection', async (event) => {
    validateSender(event, windowManager);
    try {
      const tools = await getMCPTools(database);
      const toolCount = Array.isArray(tools) ? tools.length : 0;
      return {
        success: true,
        toolCount,
      };
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
    validateSender(event, windowManager);
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
    validateSender(event, windowManager);
    try {
      const result = await mcpOauth.startOAuthFlow(providerId, database);
      return { success: true, token: result.token };
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
      return { success: true, providers: mcpOauth.getSupportedProviders() };
    } catch (err) {
      console.warn('[MCP] Get OAuth providers failed:', err?.message);
      return { success: false, providers: [], error: err?.message || String(err) };
    }
  });
}

module.exports = { register };
