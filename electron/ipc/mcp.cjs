/* eslint-disable no-console */
/**
 * IPC handlers for MCP (Model Context Protocol) settings and testing.
 */
const { getMCPTools } = require('../mcp-client.cjs');

function register({ ipcMain, windowManager, database, validateSender }) {
  /**
   * Test MCP connection - loads tools from configured servers.
   * Returns success, tool count, and optional error.
   */
  ipcMain.handle('mcp:testConnection', async (event) => {
    try {
      validateSender(event, windowManager);
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
}

module.exports = { register };
