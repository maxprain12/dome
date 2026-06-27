/* eslint-disable no-console */
'use strict';

const { Worker } = require('worker_threads');
const path = require('path');
const { pathToFileURL } = require('url');

/** @type {Worker | null} */
let _dbReadWorker = null;
/** @type {Map<number, { resolve: Function, reject: Function, timer: NodeJS.Timeout }>} */
const _pending = new Map();
let _seq = 0;

function workerScriptPath(name) {
  return path.join(__dirname, name);
}

function ensureDbReadWorker() {
  if (_dbReadWorker) return _dbReadWorker;
  const script = workerScriptPath('db-read.worker.cjs');
  _dbReadWorker = new Worker(script, {
    workerData: {},
    env: { ...process.env },
  });
  _dbReadWorker.on('message', (msg) => {
    const entry = _pending.get(msg.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    _pending.delete(msg.id);
    if (msg.ok) entry.resolve(msg.result);
    else entry.reject(new Error(msg.error || 'worker failed'));
  });
  _dbReadWorker.on('error', (err) => {
    console.error('[worker-pool] db-read worker error:', err?.message || err);
    for (const [, entry] of _pending) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    _pending.clear();
    _dbReadWorker = null;
  });
  _dbReadWorker.on('exit', (code) => {
    if (code !== 0) {
      console.warn('[worker-pool] db-read worker exited with code', code);
    }
    _dbReadWorker = null;
  });
  return _dbReadWorker;
}

/**
 * Run a heavy read-only DB task in a worker thread (opens its own readonly connection).
 * @template T
 * @param {'searchResourcesFts' | 'listProjectResourceIds'} type
 * @param {object} payload
 * @param {{ dbPath: string, timeoutMs?: number }} opts
 * @returns {Promise<T>}
 */
function runDbReadTask(type, payload, opts) {
  const worker = ensureDbReadWorker();
  const id = ++_seq;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      _pending.delete(id);
      reject(new Error(`db-read worker timeout (${type})`));
    }, timeoutMs);
    _pending.set(id, { resolve, reject, timer });
    worker.postMessage({ id, type, payload, dbPath: opts.dbPath });
  });
}

/**
 * Run document extraction in an isolated worker thread.
 * @param {object} payload
 * @returns {Promise<unknown>}
 */
function runDocumentExtract(payload) {
  const script = workerScriptPath('document-extract.worker.cjs');
  return new Promise((resolve, reject) => {
    const worker = new Worker(script, { workerData: payload });
    const timer = setTimeout(() => {
      worker.terminate().catch(() => {});
      reject(new Error('document-extract worker timeout'));
    }, payload.timeoutMs ?? 120_000);
    worker.once('message', (msg) => {
      clearTimeout(timer);
      if (msg?.ok) resolve(msg.result);
      else reject(new Error(msg?.error || 'document extract failed'));
      worker.terminate().catch(() => {});
    });
    worker.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
      worker.terminate().catch(() => {});
    });
  });
}

function shutdownWorkers() {
  for (const [, entry] of _pending) {
    clearTimeout(entry.timer);
    entry.reject(new Error('worker pool shutting down'));
  }
  _pending.clear();
  if (_dbReadWorker) {
    _dbReadWorker.terminate().catch(() => {});
    _dbReadWorker = null;
  }
}

module.exports = {
  runDbReadTask,
  runDocumentExtract,
  shutdownWorkers,
  workerScriptPath,
  pathToFileURL,
};
