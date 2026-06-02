/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

/**
 * Load .env from repo root (same pattern as electron/main.cjs)
 */
function loadDotenv() {
  const dotenvPath = path.join(__dirname, '../../.env');
  if (!fs.existsSync(dotenvPath)) return;
  const lines = fs.readFileSync(dotenvPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

module.exports = { loadDotenv };
