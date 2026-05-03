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
const { z } = require('zod');

/** Payload for dome-mcp:start (number port, { port }, nullish, or empty object). */
const DomeMcpStartPayloadSchema = z.union([
  z.number().finite(),
  z
    .object({
      port: z.union([z.number(), z.string(), z.null()]).optional(),
    })
    .passthrough(),
  z.undefined(),
  z.null(),
]);

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

    const validated = DomeMcpStartPayloadSchema.safeParse(payload);
    if (!validated.success) {
      return { success: false, error: 'Invalid payload' };
    }
    const body = validated.data;
    const rawPort =
      typeof body === 'number' && Number.isFinite(body)
        ? body
        : body && typeof body === 'object' && 'port' in body
          ? body.port
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
