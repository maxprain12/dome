/* eslint-disable no-console */
const { normalizeToolName } = require('../tool-dispatcher.cjs');

/**
 * MiniMax (and some providers) sometimes emit tool calls as XML text instead of
 * structured tool_call chunks. Parse for bench validation and optional recovery.
 */
function parseTextToolInvokes(text) {
  if (!text || typeof text !== 'string') return [];

  const invokes = [];
  const invokeRe = /<invoke\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/invoke>/gi;
  let match;
  while ((match = invokeRe.exec(text)) !== null) {
    const name = match[1];
    const body = match[2] || '';
    const args = {};
    const paramRe = /<parameter\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/parameter>/gi;
    let pm;
    while ((pm = paramRe.exec(body)) !== null) {
      const key = pm[1];
      let val = (pm[2] || '').trim();
      if (val.startsWith('[') || val.startsWith('{')) {
        try {
          val = JSON.parse(val);
        } catch {
          /* keep string */
        }
      }
      args[key] = val;
    }
    invokes.push({ name: normalizeToolName(name), args });
  }
  return invokes;
}

module.exports = { parseTextToolInvokes };
