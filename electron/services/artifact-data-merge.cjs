'use strict';

/**
 * Shared helpers for merging JSON payloads into artifact runtime data.
 * Used by automation artifact sinks and artifact feeders.
 */

function extractJsonFromOutput(outputText, mode) {
  const text = String(outputText || '').trim();
  if (!text) return null;
  if (mode === 'full_output') {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  const re = /```(?:json)?\s*([\s\S]*?)```/i;
  const m = text.match(re);
  if (!m) return null;
  try {
    return JSON.parse(m[1].trim());
  } catch {
    return null;
  }
}

function applyUpdatePolicy(current, incoming, policy) {
  if (incoming == null) return current;
  if (policy === 'replace') return incoming;
  if (policy === 'append_array') {
    const cur = Array.isArray(current) ? current : [];
    const inc = Array.isArray(incoming) ? incoming : [incoming];
    return cur.concat(inc);
  }
  const curObj = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
  const incObj = incoming && typeof incoming === 'object' && !Array.isArray(incoming) ? incoming : {};
  if (policy === 'merge_shallow') {
    return { ...curObj, ...incObj };
  }
  if (policy === 'merge_deep') {
    /** @type {Record<string, unknown>} */
    const out = { ...curObj };
    for (const [k, v] of Object.entries(incObj)) {
      const a = out[k];
      if (
        v &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        a &&
        typeof a === 'object' &&
        !Array.isArray(a)
      ) {
        out[k] = { .../** @type {Record<string, unknown>} */ (a), .../** @type {Record<string, unknown>} */ (v) };
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  return incObj;
}

/**
 * Parse JSON from feeder stdout or output file content.
 * @param {string} text
 * @param {'stdout_json'|'output_file'} outputMode
 */
function parseFeederJsonOutput(text, outputMode) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  if (outputMode === 'output_file') {
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  // stdout_json: try full parse first, then fenced block
  try {
    return JSON.parse(trimmed);
  } catch {
    return extractJsonFromOutput(trimmed, 'json_fence');
  }
}

/**
 * Build excerpt with head+tail, max ~8KB.
 * @param {string} text
 * @param {number} [maxLen]
 */
function buildExcerpt(text, maxLen = 8192) {
  const s = String(text || '');
  if (s.length <= maxLen) return s;
  const half = Math.floor(maxLen / 2) - 20;
  return `${s.slice(0, half)}\n… [truncated ${s.length - maxLen} chars] …\n${s.slice(-half)}`;
}

/**
 * Redact secret values from text excerpts.
 * @param {string} text
 * @param {string[]} secretValues
 */
function redactSecrets(text, secretValues) {
  let out = String(text || '');
  for (const val of secretValues) {
    if (!val || val.length < 2) continue;
    const escaped = val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'g'), '[REDACTED]');
  }
  return out;
}

module.exports = {
  extractJsonFromOutput,
  applyUpdatePolicy,
  parseFeederJsonOutput,
  buildExcerpt,
  redactSecrets,
};
