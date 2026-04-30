#!/usr/bin/env node
/**
 * Ensures every tool listed in getAllToolDefinitions() has a TOOL_HANDLER_MAP entry.
 * Run: node scripts/verify-tool-coverage.mjs
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const toolDispatcherPath = path.join(__dirname, '../electron/tool-dispatcher.cjs');
const { getAllToolDefinitions, TOOL_HANDLER_MAP, normalizeToolName } = require(toolDispatcherPath);

function main() {
  const defs = getAllToolDefinitions();
  const names = defs.map((d) => d?.function?.name).filter(Boolean);
  const missing = [];
  for (const name of names) {
    const norm = normalizeToolName(name);
    if (!TOOL_HANDLER_MAP[norm]) {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    console.error('[verify-tool-coverage] Tools in getAllToolDefinitions without TOOL_HANDLER_MAP:');
    missing.forEach((m) => console.error('  -', m));
    process.exit(1);
  }
  console.log('[verify-tool-coverage] OK —', names.length, 'defined tools have handlers.');
}

main();
