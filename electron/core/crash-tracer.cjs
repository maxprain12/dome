/**
 * Lightweight crash / shutdown tracer for the main process.
 *
 * Enabled when any of:
 *   DOME_CRASH_TRACE=1
 *   DOME_PROFILE is set (isolated debug profile)
 *   NODE_ENV=development
 *
 * Writes structured JSON lines to <userData>/logs/crash-trace.jsonl and keeps an
 * in-memory ring buffer of recent breadcrumbs. On fatal errors or unexpected
 * exit, flushes the buffer synchronously so packaged/debug runs leave a trail.
 *
 * Timer hooks wrap setTimeout / setInterval / setImmediate to record who
 * scheduled each callback — useful when crashes land in timers_callback_function.
 */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const MAX_BREADCRUMBS = 300;
const MAX_STACK_CHARS = 1200;
const TRACE_FILE = 'crash-trace.jsonl';

/** @type {Array<Record<string, unknown>>} */
const breadcrumbs = [];
let installed = false;
let electronHooksInstalled = false;
let logFilePath = null;
let logDirInitFailed = false;
let nextTimerId = 1;

/** @type {Map<number, { kind: string, label: string, delayMs: number | null, stack: string, scheduledAt: number }>} */
const pendingTimers = new Map();

const origSetTimeout = global.setTimeout;
const origSetInterval = global.setInterval;
const origSetImmediate = global.setImmediate;
const origClearTimeout = global.clearTimeout;
const origClearInterval = global.clearInterval;

function isEnabled() {
  if (process.env.DOME_CRASH_TRACE === '1') return true;
  if (process.env.DOME_CRASH_TRACE === '0') return false;
  if (process.env.DOME_PROFILE && String(process.env.DOME_PROFILE).trim()) return true;
  if (process.env.NODE_ENV === 'development') return true;
  return false;
}

function captureStack(skipFrames = 2) {
  const stack = new Error().stack || '';
  const lines = stack.split('\n').slice(skipFrames);
  const trimmed = lines.join('\n');
  return trimmed.length > MAX_STACK_CHARS ? `${trimmed.slice(0, MAX_STACK_CHARS)}…` : trimmed;
}

function resolveLogFile() {
  if (logFilePath || logDirInitFailed) return logFilePath;
  try {
    const { app } = require('electron');
    if (!app?.getPath) {
      logDirInitFailed = true;
      return null;
    }
    const dir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    logFilePath = path.join(dir, TRACE_FILE);
  } catch {
    logDirInitFailed = true;
  }
  return logFilePath;
}

function writeLine(entry) {
  const file = resolveLogFile();
  if (!file) return;
  let line;
  try {
    line = JSON.stringify(entry);
  } catch {
    line = JSON.stringify({
      ts: new Date().toISOString(),
      type: 'trace_write_error',
      message: 'unserializable entry',
    });
  }
  try {
    fs.appendFileSync(file, `${line}\n`);
  } catch {
    /* never throw from tracer */
  }
}

function pushBreadcrumb(type, message, fields = {}) {
  const entry = {
    ts: new Date().toISOString(),
    uptimeMs: Math.round(process.uptime() * 1000),
    pid: process.pid,
    type,
    message,
    ...fields,
  };
  breadcrumbs.push(entry);
  if (breadcrumbs.length > MAX_BREADCRUMBS) breadcrumbs.shift();
  writeLine({ ...entry, kind: 'breadcrumb' });
}

function breadcrumb(message, fields) {
  if (!isEnabled()) return;
  pushBreadcrumb('info', message, fields || {});
}

function scheduleMeta(kind, label, delayMs, stack) {
  const id = nextTimerId++;
  pendingTimers.set(id, {
    kind,
    label,
    delayMs,
    stack,
    scheduledAt: Date.now(),
  });
  return id;
}

function clearMeta(id) {
  pendingTimers.delete(id);
}

function wrapTimerCallback(metaId, fn, recurring = false) {
  return function timerWrappedCallback(...args) {
    const meta = pendingTimers.get(metaId);
    if (meta) {
      pushBreadcrumb('timer', `${meta.kind} fired: ${meta.label}`, {
        delayMs: meta.delayMs,
        ageMs: Date.now() - meta.scheduledAt,
        scheduledStack: meta.stack,
      });
      if (!recurring) pendingTimers.delete(metaId);
    }
    return fn.apply(this, args);
  };
}

function patchTimers() {
  global.setTimeout = function patchedSetTimeout(fn, delay, ...rest) {
    const label = typeof fn?.name === 'string' && fn.name ? fn.name : 'anonymous';
    const metaId = scheduleMeta('setTimeout', label, Number(delay) || 0, captureStack(3));
    const wrapped = wrapTimerCallback(metaId, fn);
    const handle = origSetTimeout.call(this, wrapped, delay, ...rest);
    pendingTimers.set(metaId, { ...pendingTimers.get(metaId), handle });
    return handle;
  };

  global.setInterval = function patchedSetInterval(fn, delay, ...rest) {
    const label = typeof fn?.name === 'string' && fn.name ? fn.name : 'anonymous';
    const metaId = scheduleMeta('setInterval', label, Number(delay) || 0, captureStack(3));
    const wrapped = wrapTimerCallback(metaId, fn, true);
    const handle = origSetInterval.call(this, wrapped, delay, ...rest);
    pendingTimers.set(metaId, { ...pendingTimers.get(metaId), handle });
    return handle;
  };

  global.setImmediate = function patchedSetImmediate(fn, ...rest) {
    const label = typeof fn?.name === 'string' && fn.name ? fn.name : 'anonymous';
    const metaId = scheduleMeta('setImmediate', label, null, captureStack(3));
    const wrapped = wrapTimerCallback(metaId, fn);
    return origSetImmediate.call(this, wrapped, ...rest);
  };

  global.clearTimeout = function patchedClearTimeout(handle) {
    for (const [metaId, meta] of pendingTimers.entries()) {
      if (meta.handle === handle) pendingTimers.delete(metaId);
    }
    return origClearTimeout.call(this, handle);
  };

  global.clearInterval = function patchedClearInterval(handle) {
    for (const [metaId, meta] of pendingTimers.entries()) {
      if (meta.handle === handle) pendingTimers.delete(metaId);
    }
    return origClearInterval.call(this, handle);
  };
}

function flushFatal(reason, error) {
  if (!isEnabled()) return;
  const err =
    error instanceof Error
      ? { message: error.message, stack: error.stack, name: error.name }
      : { message: String(error ?? reason) };

  const report = {
    ts: new Date().toISOString(),
    kind: 'fatal',
    reason,
    uptimeMs: Math.round(process.uptime() * 1000),
    pid: process.pid,
    argv: process.argv.slice(0, 8),
    cwd: process.cwd(),
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    packaged: (() => {
      try {
        const { app } = require('electron');
        return !!app?.isPackaged;
      } catch {
        return null;
      }
    })(),
    userData: (() => {
      try {
        const { app } = require('electron');
        return app?.getPath?.('userData') ?? null;
      } catch {
        return null;
      }
    })(),
    error: err,
    pendingTimers: [...pendingTimers.values()].slice(0, 50),
    breadcrumbs: [...breadcrumbs],
  };

  writeLine(report);

  const file = resolveLogFile();
  if (file) {
    try {
      const fd = fs.openSync(file, 'a');
      fs.fsyncSync(fd);
      fs.closeSync(fd);
    } catch {
      /* ignore */
    }
  }

  try {
    const logger = require('./logger.cjs');
    logger.error('crash-tracer', reason, {
      error: err.message,
      stack: err.stack,
      traceFile: file,
      breadcrumbCount: breadcrumbs.length,
    });
  } catch {
    /* ignore */
  }

  console.error('[crash-tracer] FATAL:', reason, err.message);
  if (file) console.error('[crash-tracer] Trace written to:', file);
}

function installProcessHooks() {
  if (!isEnabled() || installed) return false;

  patchTimers();
  installed = true;

  pushBreadcrumb('lifecycle', 'crash-tracer installed', {
    enabledBy: process.env.DOME_CRASH_TRACE
      ? 'DOME_CRASH_TRACE'
      : process.env.DOME_PROFILE
        ? 'DOME_PROFILE'
        : 'NODE_ENV=development',
  });

  process.on('uncaughtException', (error) => {
    flushFatal('uncaughtException', error);
  });

  process.on('unhandledRejection', (reason) => {
    flushFatal('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
  });

  process.on('exit', (code) => {
    if (code !== 0) {
      flushFatal('process.exit', new Error(`exit code ${code}`));
    } else {
      pushBreadcrumb('lifecycle', 'process exit 0');
    }
  });

  process.on('SIGTERM', () => {
    pushBreadcrumb('signal', 'SIGTERM');
    flushFatal('SIGTERM', new Error('SIGTERM received'));
  });

  process.on('SIGINT', () => {
    pushBreadcrumb('signal', 'SIGINT');
  });

  if (typeof process.report?.writeReport === 'function') {
    process.on('uncaughtException', () => {
      try {
        const dir = resolveLogFile() ? path.dirname(resolveLogFile()) : process.cwd();
        process.report.writeReport(path.join(dir, `report-${Date.now()}.json`));
      } catch {
        /* ignore */
      }
    });
  }

  return true;
}

/**
 * @param {import('electron').App} app
 * @param {{ onWindowCreated?: (win: import('electron').BrowserWindow) => void }=} opts
 */
function installElectronHooks(app, opts = {}) {
  if (!isEnabled() || electronHooksInstalled || !app) return;
  electronHooksInstalled = true;

  app.on('will-quit', (event) => {
    pushBreadcrumb('electron', 'will-quit', { prevented: event?.defaultPrevented ?? false });
  });

  app.on('before-quit', () => {
    pushBreadcrumb('electron', 'before-quit');
  });

  app.on('quit', (_event, exitCode) => {
    pushBreadcrumb('electron', 'quit', { exitCode });
    if (exitCode !== 0) flushFatal('app.quit', new Error(`quit exitCode=${exitCode}`));
  });

  app.on('render-process-gone', (_event, webContents, details) => {
    flushFatal('render-process-gone', new Error(JSON.stringify({
      reason: details?.reason,
      exitCode: details?.exitCode,
      url: webContents?.getURL?.(),
    })));
  });

  app.on('child-process-gone', (_event, details) => {
    flushFatal('child-process-gone', new Error(JSON.stringify({
      type: details?.type,
      reason: details?.reason,
      exitCode: details?.exitCode,
      serviceName: details?.serviceName,
      name: details?.name,
    })));
  });

  if (opts.onWindowCreated) {
    /* caller wires window hooks */
  }
}

/** Explicit named timer — clearer breadcrumbs than anonymous callbacks. */
function namedTimeout(name, fn, delayMs) {
  const wrapped = function namedTimerCallback() {
    pushBreadcrumb('namedTimer', name, { delayMs });
    return fn();
  };
  Object.defineProperty(wrapped, 'name', { value: name });
  return origSetTimeout(wrapped, delayMs);
}

function getTraceLogPath() {
  return resolveLogFile();
}

function getRecentBreadcrumbs() {
  return [...breadcrumbs];
}

module.exports = {
  isEnabled,
  installProcessHooks,
  installElectronHooks,
  breadcrumb,
  flushFatal,
  namedTimeout,
  getTraceLogPath,
  getRecentBreadcrumbs,
};
