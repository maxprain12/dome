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
  domeMcpServer = require('../../mcp/dome-mcp-server.cjs');
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

function extractPort(body) {
  const rawPort =
    typeof body === 'number' && Number.isFinite(body)
      ? body
      : body && typeof body === 'object' && 'port' in body
        ? body.port
        : undefined;
  if (rawPort == null || rawPort === '') return null;
  const n = Number(rawPort);
  return Number.isFinite(n) ? n : null;
}

function readSavedPort(database) {
  if (!database) return null;
  try {
    const q = database.getQueries();
    const row = q.getSetting?.get('dome_mcp_port');
    if (row?.value) return parseInt(row.value, 10);
  } catch {}
  return null;
}

function persistStartSettings(database, port) {
  if (!database) return;
  try {
    const q = database.getQueries();
    q.setSetting?.run('dome_mcp_enabled', '1');
    q.setSetting?.run('dome_mcp_port', String(port));
  } catch {}
}

function persistStopSettings(database) {
  if (!database) return;
  try {
    const q = database.getQueries();
    q.setSetting?.run('dome_mcp_enabled', '0');
  } catch {}
}

function unauthorizedResponse() {
  return { success: false, error: 'Unauthorized' };
}

function ensureServerAvailable() {
  if (!domeMcpServer) return { success: false, error: 'MCP server module not available' };
  return null;
}

function register({ ipcMain, windowManager, database }) {
  ipcMain.handle('dome-mcp:start', async (event, payload) => {
    if (!windowManager.isAuthorized(event.sender.id)) return unauthorizedResponse();
    const unavailable = ensureServerAvailable();
    if (unavailable) return unavailable;

    const validated = DomeMcpStartPayloadSchema.safeParse(payload);
    if (!validated.success) return { success: false, error: 'Invalid payload' };

    let listenPort = extractPort(validated.data);
    if (!listenPort) listenPort = readSavedPort(database);

    const result = await domeMcpServer.start(listenPort || 37214);
    if (result.success) persistStartSettings(database, result.port);
    return result;
  });

  ipcMain.handle('dome-mcp:stop', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) return unauthorizedResponse();
    const unavailable = ensureServerAvailable();
    if (unavailable) return unavailable;

    const result = await domeMcpServer.stop();
    if (result.success) persistStopSettings(database);
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
