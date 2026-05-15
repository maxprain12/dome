/* eslint-disable no-console */
'use strict';

/**
 * Embeddings utility-process worker.
 *
 * Runs @huggingface/transformers (ONNX) in an isolated utilityProcess so that
 * a native SIGTRAP only kills this helper and not the entire Electron app.
 *
 * Protocol (via process.parentPort):
 *   Incoming: { id, type: 'init'|'embedDocuments'|'embedQuery'|'reset', payload? }
 *   Outgoing: { id, type: 'success'|'error', payload? }
 *
 * embedDocuments returns a single ArrayBuffer (transferable):
 *   N × EMBED_DIM Float32 values concatenated (N = texts.length).
 *
 * embedQuery returns a single ArrayBuffer of EMBED_DIM Float32 values.
 */

const NOMIC_MODEL_ID = 'nomic-ai/nomic-embed-text-v1.5';
const EMBED_BATCH = 4;
const EMBED_DIM = 768;
const PIPELINE_RESET_INTERVAL = 4;

let _modelsDir = null;
let _pipelinePromise = null;

let _embedMutexChain = Promise.resolve();
function runEmbedExclusive(fn) {
  const run = _embedMutexChain.then(() => fn());
  _embedMutexChain = run.catch(() => {});
  return run;
}

async function disposePipeline() {
  if (!_pipelinePromise) return;
  try {
    const pipe = await _pipelinePromise;
    await pipe?.dispose?.();
  } catch (_) { /* best-effort */ }
  _pipelinePromise = null;
}

function resetPipeline() {
  // Fire-and-forget dispose so native ONNX session is released.
  void disposePipeline();
}

async function getPipeline() {
  if (!_pipelinePromise) {
    _pipelinePromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      if (_modelsDir) env.cacheDir = _modelsDir;
      env.allowLocalModels = true;
      env.useBrowserCache = false;
      return pipeline('feature-extraction', NOMIC_MODEL_ID, { dtype: 'q8' });
    })();
  }
  return _pipelinePromise;
}

function tensorToRowVectors(tensor) {
  const data = tensor.data;
  const dims = tensor.dims;
  if (!dims || dims.length === 0) return [new Float32Array(0)];
  if (dims.length === 1) return [Float32Array.from(data)];
  const batch = dims[0];
  const dim = dims[1];
  const rows = [];
  for (let b = 0; b < batch; b++) {
    const start = b * dim;
    rows.push(Float32Array.from(data.subarray(start, start + dim)));
  }
  return rows;
}

/** Pack Float32Array[] into a single ArrayBuffer for zero-copy transfer. */
function packVectors(rows) {
  const buf = new ArrayBuffer(rows.length * EMBED_DIM * 4);
  const view = new Float32Array(buf);
  for (let i = 0; i < rows.length; i++) {
    view.set(rows[i], i * EMBED_DIM);
  }
  return buf;
}

async function handleEmbedDocuments(texts) {
  return runEmbedExclusive(async () => {
    const arr = texts || [];
    const len = arr.length;
    if (len === 0) return packVectors([]);
    if (len >= 32) resetPipeline();
    const out = [];
    let pipe = await getPipeline();
    let batchIdx = 0;
    for (let i = 0; i < len; i += EMBED_BATCH) {
      if (batchIdx > 0 && batchIdx % PIPELINE_RESET_INTERVAL === 0) {
        resetPipeline();
        pipe = await getPipeline();
      }
      const slice = [];
      for (let j = i; j < Math.min(i + EMBED_BATCH, len); j++) {
        slice.push(`search_document: ${String(arr[j] ?? '')}`);
      }
      let tensor;
      try {
        tensor = await pipe(slice, { pooling: 'mean', normalize: true });
      } catch (e) {
        resetPipeline();
        throw e;
      }
      out.push(...tensorToRowVectors(tensor));
      batchIdx++;
      await new Promise((r) => setImmediate(r));
    }
    return packVectors(out);
  });
}

async function handleEmbedQuery(text) {
  const MAX_QUERY_CHARS = 16000;
  const q = String(text || '').trim().slice(0, MAX_QUERY_CHARS);
  if (!q) {
    return new Float32Array(EMBED_DIM).buffer;
  }
  return runEmbedExclusive(async () => {
    const pipe = await getPipeline();
    let tensor;
    try {
      tensor = await pipe(`search_query: ${q}`, { pooling: 'mean', normalize: true });
    } catch (e) {
      resetPipeline();
      throw e;
    }
    const rows = tensorToRowVectors(tensor);
    const row = rows[0] || new Float32Array(EMBED_DIM);
    return packVectors([row]);
  });
}

process.parentPort.on('message', async ({ data }) => {
  const { id, type, payload } = data ?? {};

  try {
    if (type === 'init') {
      if (payload?.modelsDir) _modelsDir = payload.modelsDir;
      process.parentPort.postMessage({ id, type: 'success' });

    } else if (type === 'embedDocuments') {
      const buf = await handleEmbedDocuments(payload?.texts);
      process.parentPort.postMessage({ id, type: 'success', payload: buf }, [buf]);

    } else if (type === 'embedQuery') {
      const buf = await handleEmbedQuery(payload?.text);
      process.parentPort.postMessage({ id, type: 'success', payload: buf }, [buf]);

    } else if (type === 'reset') {
      resetPipeline();
      process.parentPort.postMessage({ id, type: 'success' });

    } else {
      process.parentPort.postMessage({ id, type: 'error', payload: { message: `Unknown type: ${type}` } });
    }
  } catch (err) {
    console.error(`[EmbeddingsWorker] error in ${type}:`, err?.message || err);
    process.parentPort.postMessage({ id, type: 'error', payload: { message: err?.message || String(err) } });
  }
});

console.log('[EmbeddingsWorker] ready');
