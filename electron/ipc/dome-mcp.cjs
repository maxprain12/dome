/* eslint-disable no-console */
'use strict';

/**
 * IPC handlers for Dome's built-in MCP server.
 *
 * dome-mcp:start  — Start the server (optionally on a specific port).
 * dome-mcp:stop   — Stop the server.
 * dome-mcp:status — Return { running, port, sessions }.
 */

const path = require('path');

let domeMcpServer;
try {
  domeMcpServer = require('../dome-mcp-server.cjs');
} catch (e) {
  console.error('[DomeMCP IPC] Failed to load dome-mcp-server:', e.message);
}

function getBridgePath() {
  // In production: unpacked from asar so node can execute it
  if (process.resourcesPath && require('fs').existsSync(
    path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'dome-mcp-bridge.cjs'),
  )) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'dome-mcp-bridge.cjs');
  }
  // Dev / unpackaged
  return path.join(__dirname, '../dome-mcp-bridge.cjs');
}

function register({ ipcMain, windowManager, database }) {
  ipcMain.handle('dome-mcp:start', async (event, payload) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!domeMcpServer) return { success: false, error: 'MCP server module not available' };

    const rawPort =
      typeof payload === 'number' && Number.isFinite(payload)
        ? payload
        : payload && typeof payload === 'object' && 'port' in payload
          ? payload.port
          : undefined;
    let listenPort = rawPort != null && rawPort !== '' ? Number(rawPort) : null;
    if (listenPort !== null && !Number.isFinite(listenPort)) listenPort = null;

    // Read saved port from settings if none provided
    if (!listenPort && database) {
      try {
        const q = database.getQueries();
        const row = q.getSetting?.get('dome_mcp_port');
        if (row?.value) listenPort = parseInt(row.value, 10);
      } catch {}
    }

    const result = await domeMcpServer.start(listenPort || 37214);

    // Persist the enabled flag
    if (result.success && database) {
      try {
        const q = database.getQueries();
        q.setSetting?.run('dome_mcp_enabled', '1');
        q.setSetting?.run('dome_mcp_port', String(result.port));
      } catch {}
    }

    return result;
  });

  ipcMain.handle('dome-mcp:stop', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!domeMcpServer) return { success: false, error: 'MCP server module not available' };

    const result = await domeMcpServer.stop();

    if (result.success && database) {
      try {
        const q = database.getQueries();
        q.setSetting?.run('dome_mcp_enabled', '0');
      } catch {}
    }

    return result;
  });

  ipcMain.handle('dome-mcp:status', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { running: false, port: null, sessions: [] };
    }
    if (!domeMcpServer) return { running: false, port: null, sessions: [] };
    return domeMcpServer.getStatus();
  });

  ipcMain.handle('dome-mcp:bridge-path', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) return null;
    return getBridgePath();
  });
}

module.exports = { register };
