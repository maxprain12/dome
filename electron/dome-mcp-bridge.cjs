#!/usr/bin/env node
'use strict';

/**
 * Dome MCP stdio bridge — wraps the HTTP MCP server for clients that
 * only support stdio transport (older Claude Desktop versions).
 *
 * Usage (in claude_desktop_config.json):
 *   {
 *     "dome": {
 *       "command": "node",
 *       "args": ["/path/to/dome-mcp-bridge.cjs"],
 *       "env": { "DOME_MCP_PORT": "37214" }
 *     }
 *   }
 *
 * The bridge:
 *  1. Reads newline-delimited JSON-RPC messages from stdin
 *  2. POSTs each message to the Dome HTTP MCP server
 *  3. Writes the response to stdout
 *
 * It maintains a single persistent session-id after initialize.
 */

const http = require('http');

const PORT = parseInt(process.env.DOME_MCP_PORT || '37214', 10);
const HOST = '127.0.0.1';
const MCP_PATH = '/mcp';

let sessionId = null;

function post(body, sid) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const opts = {
      hostname: HOST,
      port: PORT,
      path: MCP_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Streamable HTTP transport requires this Accept header (SDK returns 406 otherwise).
        Accept: 'application/json, text/event-stream',
        'Content-Length': Buffer.byteLength(payload),
        ...(sid ? { 'mcp-session-id': sid } : {}),
      },
    };

    const req = http.request(opts, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        const newSid = res.headers['mcp-session-id'];
        if (newSid && !sessionId) sessionId = newSid;
        const ct = res.headers['content-type'] || '';
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 400)}`));
          return;
        }
        try {
          resolve(raw.trim() ? JSON.parse(raw) : null);
        } catch (e) {
          reject(
            new Error(
              `Invalid JSON in MCP response (${ct || '?'}): ${e?.message || e} — ${raw.slice(0, 200)}`,
            ),
          );
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Read newline-delimited JSON from stdin
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', async (chunk) => {
  buf += chunk;
  const lines = buf.split('\n');
  buf = lines.pop() ?? '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let msg;
    try { msg = JSON.parse(trimmed); } catch { continue; }
    try {
      const resp = await post(msg, sessionId);
      if (resp) process.stdout.write(JSON.stringify(resp) + '\n');
    } catch (e) {
      // Return a JSON-RPC error
      if (msg.id != null) {
        const err = { jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: e?.message || 'Bridge error' } };
        process.stdout.write(JSON.stringify(err) + '\n');
      }
    }
  }
});

process.stdin.on('end', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
