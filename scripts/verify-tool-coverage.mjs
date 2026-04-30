#!/usr/bin/env node
/**
 * Ensures every tool listed in getAllToolDefinitions() has a TOOL_HANDLER_MAP entry.
 *
 * Does not require() tool-dispatcher.cjs (that pulls electron, database, native deps).
 * Safe for CI: npm ci --ignore-scripts
 *
 * Run: node scripts/verify-tool-coverage.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function normalizeToolName(name) {
  return (name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/** @param {string} src @param {number} openIdx index of `{` */
function indexOfMatchingBrace(src, openIdx) {
  let depth = 0;
  let i = openIdx;
  let inStr = /** @type {null | `"` | `'` | '`'} */ (null);
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];

    if (inLineComment) {
      if (c === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inStr) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (c === '\\') {
        escaped = true;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }

    if (c === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (c === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inStr = c;
      continue;
    }

    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** @param {string} src @param {number} openIdx index of `[` */
function indexOfMatchingBracket(src, openIdx) {
  let depth = 0;
  let i = openIdx;
  let inStr = /** @type {null | `"` | `'` | '`'} */ (null);
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];

    if (inLineComment) {
      if (c === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inStr) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (c === '\\') {
        escaped = true;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }

    if (c === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (c === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inStr = c;
      continue;
    }

    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function extractToolHandlerKeys(mapBody) {
  const keys = new Set();
  const re = /^\s*([a-zA-Z0-9_]+)\s*:\s*'/gm;
  let m;
  while ((m = re.exec(mapBody)) !== null) {
    keys.add(m[1]);
  }
  return keys;
}

/** Tool `function.name` lines use exactly 8 spaces before `name:` in tool-dispatcher.cjs */
function extractDefinitionToolNames(arrayBody) {
  const names = [];
  const re = /\n {8}name: '([^']+)'/g;
  let m;
  while ((m = re.exec(arrayBody)) !== null) {
    names.push(m[1]);
  }
  return names;
}

function main() {
  const toolDispatcherPath = path.join(__dirname, '../electron/tool-dispatcher.cjs');
  const src = fs.readFileSync(toolDispatcherPath, 'utf8');

  const mapMarker = 'const TOOL_HANDLER_MAP = ';
  const mapEq = src.indexOf(mapMarker);
  if (mapEq === -1) {
    console.error('[verify-tool-coverage] Could not find TOOL_HANDLER_MAP');
    process.exit(1);
  }
  const mapOpen = src.indexOf('{', mapEq);
  if (mapOpen === -1) {
    console.error('[verify-tool-coverage] Could not parse TOOL_HANDLER_MAP opening brace');
    process.exit(1);
  }
  const mapClose = indexOfMatchingBrace(src, mapOpen);
  if (mapClose === -1) {
    console.error('[verify-tool-coverage] Could not parse TOOL_HANDLER_MAP closing brace');
    process.exit(1);
  }
  const mapBody = src.slice(mapOpen + 1, mapClose);
  const handlerKeys = extractToolHandlerKeys(mapBody);

  const fnMarker = 'function getAllToolDefinitions()';
  const fnIdx = src.indexOf(fnMarker);
  if (fnIdx === -1) {
    console.error('[verify-tool-coverage] Could not find getAllToolDefinitions');
    process.exit(1);
  }
  const searchFrom = fnIdx + fnMarker.length;
  const returnIdx = src.indexOf('return [', searchFrom);
  if (returnIdx === -1) {
    console.error('[verify-tool-coverage] Could not find return [ in getAllToolDefinitions');
    process.exit(1);
  }
  const arrOpen = src.indexOf('[', returnIdx);
  if (arrOpen === -1) {
    console.error('[verify-tool-coverage] Could not parse tool definitions array');
    process.exit(1);
  }
  const arrClose = indexOfMatchingBracket(src, arrOpen);
  if (arrClose === -1) {
    console.error('[verify-tool-coverage] Could not parse end of tool definitions array');
    process.exit(1);
  }
  const arrayBody = src.slice(arrOpen, arrClose + 1);
  const names = extractDefinitionToolNames(arrayBody);

  const missing = [];
  for (const name of names) {
    const norm = normalizeToolName(name);
    let found = handlerKeys.has(norm) || handlerKeys.has(name);
    if (!found) {
      for (const hk of handlerKeys) {
        if (normalizeToolName(hk) === norm) {
          found = true;
          break;
        }
      }
    }
    if (!found) missing.push(name);
  }

  if (missing.length > 0) {
    console.error('[verify-tool-coverage] Tools in getAllToolDefinitions without TOOL_HANDLER_MAP entry:');
    missing.forEach((m) => console.error('  -', m));
    process.exit(1);
  }

  console.log('[verify-tool-coverage] OK —', names.length, 'defined tools have handlers.');
}

main();
