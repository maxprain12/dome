/* eslint-disable no-console */
'use strict';

/**
 * Embeddings service — main-process client for the embeddings utilityProcess worker.
 *
 * All heavy ONNX / @huggingface/transformers work runs inside
 * electron/workers/embeddings-worker.cjs so a native SIGTRAP only kills the
 * worker and leaves the Electron main process alive. The worker is auto-respawned
 * up to MAX_RESPAWN times within RESPAWN_WINDOW_MS; beyond that, calls degrade
 * gracefully (return zero vectors) so the UI is never blocked.
 *
 * Public API (unchanged from before):
 *   embedDocuments(texts: string[]): Promise<Float32Array[]>
 *   embedQuery(text: string): Promise<Float32Array>
 *   floatsToBlob(arr: Float32Array): Buffer
 *   blobToFloats(buf: Buffer|Uint8Array): Float32Array
 *   configureTransformersEnv({ modelsDir: string }): void
 *   resetPipeline(): void
 *   MODEL_VERSION, NOMIC_MODEL_ID, EMBED_DIM, EMBED_BATCH, MAX_QUERY_CHARS
 */

const path = require('path');
const { utilityProcess } = require('electron');
const crypto = require('crypto');

const NOMIC_MODEL_ID = 'nomic-ai/nomic-embed-text-v1.5';
const MODEL_VERSION = 'nomic-embed-text-v1.5';
const EMBED_BATCH = 4;
const EMBED_DIM = 768;
const MAX_QUERY_CHARS = 16000;

// In a packaged app the worker lives in app.asar.unpacked (utilityProcess.fork
// needs a real path on disk, not a virtual asar path).
const WORKER_PATH = path.join(__dirname, '../workers/embeddings-worker.cjs')
  .replace(/app\.asar(?!\.(unpacked|js))/g, 'app.asar.unpacked');

const MAX_RESPAWN = 3;
const RESPAWN_WINDOW_MS = 60_000;

let _modelsDir = null;
let _worker = null;
let _pending = new Map(); // id → { resolve, reject }
let _degraded = false;
let _respawnCount = 0;
let _respawnWindowStart = Date.now();

function _spawnWorker() {
  if (_worker) {
    try { _worker.kill(); } catch (_) { /* ignore */ }
    _worker = null;
  }

  _worker = utilityProcess.fork(WORKER_PATH, [], {
    serviceName: 'dome-embeddings',
    stdio: 'pipe',
  });

  _worker.stdout?.on('data', (d) => process.stdout.write(`[EmbeddingsWorker] ${d}`));
  _worker.stderr?.on('data', (d) => process.stderr.write(`[EmbeddingsWorker:err] ${d}`));

  _worker.on('message', ({ id, type, payload }) => {
    const pending = _pending.get(id);
    if (!pending) return;
    _pending.delete(id);
    if (type === 'error') {
      pending.reject(new Error(payload?.message || 'Worker error'));
    } else {
      pending.resolve(payload);
    }
  });

  _worker.on('exit', (code) => {
    console.warn(`[EmbeddingsService] worker exited (code=${code})`);

    // Reject all in-flight calls
    for (const { reject } of _pending.values()) {
      reject(new Error('Embeddings worker exited unexpectedly'));
    }
    _pending.clear();
    _worker = null;

    if (_degraded) return; // already gave up

    // Respawn rate-limit
    const now = Date.now();
    if (now - _respawnWindowStart > RESPAWN_WINDOW_MS) {
      _respawnCount = 0;
      _respawnWindowStart = now;
    }

    if (_respawnCount < MAX_RESPAWN) {
      _respawnCount++;
      console.warn(`[EmbeddingsService] respawning worker (attempt ${_respawnCount}/${MAX_RESPAWN})`);
      _spawnWorker();
      if (_modelsDir) _sendInit();
    } else {
      _degraded = true;
      console.error('[EmbeddingsService] worker crashed too many times — embeddings degraded (zero vectors)');
    }
  });

  if (_modelsDir) _sendInit();
}

function _sendInit() {
  _postMessage({ type: 'init', payload: { modelsDir: _modelsDir } }).catch(console.warn);
}

function _postMessage(msg) {
  return new Promise((resolve, reject) => {
    if (_degraded) {
      reject(new Error('Embeddings worker is degraded'));
      return;
    }
    if (!_worker) _spawnWorker();
    const id = crypto.randomUUID();
    _pending.set(id, { resolve, reject });
    _worker.postMessage({ id, ...msg });
  });
}

/**
 * Unpack a packed ArrayBuffer (N × EMBED_DIM floats) into Float32Array[].
 */
function _unpackVectors(buf) {
  if (!buf || buf.byteLength === 0) return [];
  const view = new Float32Array(buf);
  const n = view.length / EMBED_DIM;
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push(Float32Array.from(view.subarray(i * EMBED_DIM, (i + 1) * EMBED_DIM)));
  }
  return rows;
}

// ─── Public API ──────────────────────────────────────────────────────────────

function configureTransformersEnv(opts) {
  if (opts?.modelsDir) {
    _modelsDir = opts.modelsDir;
    if (_worker) _sendInit();
  }
}

/**
 * @param {string[]} texts
 * @returns {Promise<Float32Array[]>}
 */
async function embedDocuments(texts) {
  if (_degraded) {
    console.warn('[EmbeddingsService] degraded — returning zero vectors');
    return (texts || []).map(() => new Float32Array(EMBED_DIM));
  }
  const buf = await _postMessage({ type: 'embedDocuments', payload: { texts } });
  return _unpackVectors(buf);
}

/**
 * @param {string} text
 * @returns {Promise<Float32Array>}
 */
async function embedQuery(text) {
  if (_degraded) {
    return new Float32Array(EMBED_DIM);
  }
  const buf = await _postMessage({ type: 'embedQuery', payload: { text } });
  const rows = _unpackVectors(buf);
  return rows[0] || new Float32Array(EMBED_DIM);
}

function resetPipeline() {
  if (_worker) {
    _postMessage({ type: 'reset' }).catch(console.warn);
  }
}

/**
 * Pre-warm the worker after app.ready (call from main.cjs whenReady block).
 * Safe to call multiple times — no-op if already spawned.
 */
function initWorker() {
  if (!_worker) _spawnWorker();
}

/**
 * Cleanly shut down the worker (called from main on will-quit).
 */
function disposeWorker() {
  if (_worker) {
    try { _worker.kill(); } catch (_) { /* ignore */ }
    _worker = null;
  }
  _pending.clear();
}

// ─── Blob helpers (unchanged) ─────────────────────────────────────────────────

function floatsToBlob(arr) {
  const f = arr instanceof Float32Array ? arr : Float32Array.from(arr);
  return Buffer.from(f.buffer, f.byteOffset, f.byteLength);
}

function blobToFloats(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
}

// Keep for test harness compatibility
function resetForTests() { resetPipeline(); }

module.exports = {
  configureTransformersEnv,
  initWorker,
  embedDocuments,
  embedQuery,
  floatsToBlob,
  blobToFloats,
  resetPipeline,
  disposeWorker,
  resetForTests,
  MODEL_VERSION,
  NOMIC_MODEL_ID,
  EMBED_DIM,
  EMBED_BATCH,
  MAX_QUERY_CHARS,
};
