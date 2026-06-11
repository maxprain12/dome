/* eslint-disable no-console */
/**
 * Structured logging for main process (JSON lines).
 *
 * - Console always (pretty in dev terminals, still JSON for grep-ability).
 * - File output to <userData>/logs/dome-main.log with size-based rotation
 *   (MAX_LOG_BYTES x MAX_LOG_FILES). Disabled automatically outside Electron
 *   (unit tests) or before the app module is available.
 * - Secret-like fields (key/token/secret/password/authorization) are redacted.
 */
const fs = require('fs');
const path = require('path');

const MAX_LOG_BYTES = 5 * 1024 * 1024;
const MAX_LOG_FILES = 3;
const SECRET_FIELD_RE = /key|token|secret|password|authorization|credential/i;
const SECRET_VALUE_RE = /^(sk-|sk_|xoxb-|ghp_|gho_|AIza|Bearer\s)/;

let logDir = null;
let logFileInitFailed = false;

function resolveLogDir() {
  if (logDir || logFileInitFailed) return logDir;
  try {
    // Lazy: logger can be required before Electron's app is ready (or in tests).
    const { app } = require('electron');
    if (!app?.getPath) {
      logFileInitFailed = true;
      return null;
    }
    const dir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    logDir = dir;
  } catch {
    logFileInitFailed = true;
  }
  return logDir;
}

function rotateIfNeeded(file) {
  try {
    const { size } = fs.statSync(file);
    if (size < MAX_LOG_BYTES) return;
    for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
      const from = i === 1 ? file : `${file}.${i - 1}`;
      const to = `${file}.${i}`;
      if (fs.existsSync(from)) fs.renameSync(from, to);
    }
  } catch {
    /* missing file or rotation race: ignore */
  }
}

function writeToFile(line) {
  const dir = resolveLogDir();
  if (!dir) return;
  const file = path.join(dir, 'dome-main.log');
  try {
    rotateIfNeeded(file);
    fs.appendFileSync(file, line + '\n');
  } catch {
    /* never let logging break the app */
  }
}

function redact(value, keyName, depth = 0) {
  if (depth > 4) return '[depth]';
  if (typeof value === 'string') {
    if ((keyName && SECRET_FIELD_RE.test(keyName)) || SECRET_VALUE_RE.test(value)) {
      return '[redacted]';
    }
    return value.length > 4000 ? value.slice(0, 4000) + '…[truncated]' : value;
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, keyName, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = redact(v, k, depth + 1);
    return out;
  }
  return value;
}

function log(level, component, message, fields = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    component,
    message,
    ...redact(fields, null),
  };
  let line;
  try {
    line = JSON.stringify(entry);
  } catch {
    line = JSON.stringify({ ts: entry.ts, level, component, message, fields: '[unserializable]' });
  }
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
  writeToFile(line);
}

function getLogDirectory() {
  return resolveLogDir();
}

module.exports = {
  info: (component, message, fields) => log('info', component, message, fields),
  warn: (component, message, fields) => log('warn', component, message, fields),
  error: (component, message, fields) => log('error', component, message, fields),
  debug: (component, message, fields) => {
    if (process.env.DEBUG || process.env.DOME_LOG_LEVEL === 'debug' || process.env.NODE_ENV === 'development') {
      log('debug', component, message, fields);
    }
  },
  getLogDirectory,
};
