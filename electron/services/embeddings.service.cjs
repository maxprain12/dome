/* eslint-disable no-console */
'use strict';

/** Nomic instruct model — must use task prefixes (centralized here only). */
const NOMIC_MODEL_ID = 'nomic-ai/nomic-embed-text-v1.5';

/** Stored in `resource_chunks.model_version` / settings. */
const MODEL_VERSION = 'nomic-embed-text-v1.5';

const EMBED_BATCH = 8;
const EMBED_DIM = 768;
/** Defensive cap per string passed to the tokenizer / ONNX (avoids pathological inputs). */
const MAX_INPUT_CHARS = 6000;

/** @type {string | null} */
let _modelsDir = null;
/** @type {Promise<any> | null} */
let _pipelinePromise = null;

/**
 * Serialize ONNX / transformers inference. Concurrent `pipe()` calls on the shared
 * session can crash the native runtime (macOS SIGTRAP) when full-sync,
 * reindex-all, background indexing, and IPC indexResource overlap.
 */
let _embedMutexChain = Promise.resolve();
function runEmbedExclusive(fn) {
  const run = _embedMutexChain.then(() => fn());
  _embedMutexChain = run.catch(() => {});
  return run;
}

/**
 * @param {{ modelsDir: string }} opts
 */
function configureTransformersEnv(opts) {
  if (opts?.modelsDir) {
    _modelsDir = opts.modelsDir;
    _pipelinePromise = null;
  }
}

async function getPipeline() {
  if (!_pipelinePromise) {
    _pipelinePromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      if (_modelsDir) {
        env.cacheDir = _modelsDir;
      }
      env.allowLocalModels = true;
      env.useBrowserCache = false;
      // Single-file ONNX on the hub (no companion *.onnx_data). External-data mode breaks resolution.
      return pipeline('feature-extraction', NOMIC_MODEL_ID, {
        dtype: 'q8',
      });
    })();
  }
  return _pipelinePromise;
}

/**
 * Clear cached pipeline so the next embed call loads a fresh session (recovery after native errors).
 */
function resetPipeline() {
  _pipelinePromise = null;
}

/**
 * @param {string} s
 */
function truncateForEmbed(s) {
  const t = String(s ?? '');
  return t.length <= MAX_INPUT_CHARS ? t : t.slice(0, MAX_INPUT_CHARS);
}

/**
 * @param {{ data: Float32Array, dims: number[] }} tensor
 * @returns {Float32Array[]}
 */
function tensorToRowVectors(tensor) {
  const data = tensor.data;
  const dims = tensor.dims;
  if (!dims || dims.length === 0) {
    return [new Float32Array(0)];
  }
  if (dims.length === 1) {
    return [Float32Array.from(data)];
  }
  const batch = dims[0];
  const dim = dims[1];
  const rows = [];
  for (let b = 0; b < batch; b++) {
    const start = b * dim;
    rows.push(Float32Array.from(data.subarray(start, start + dim)));
  }
  return rows;
}

/**
 * @param {string[]} texts
 * @returns {Promise<Float32Array[]>}
 */
async function embedDocuments(texts) {
  return runEmbedExclusive(async () => {
    const pipe = await getPipeline();
    const inputs = (texts || []).map((t) => `search_document: ${truncateForEmbed(t)}`);
    const out = [];
    for (let i = 0; i < inputs.length; i += EMBED_BATCH) {
      const slice = inputs.slice(i, i + EMBED_BATCH);
      let tensor;
      try {
        tensor = await pipe(slice, { pooling: 'mean', normalize: true });
      } catch (e) {
        resetPipeline();
        throw e;
      }
      out.push(...tensorToRowVectors(tensor));
    }
    return out;
  });
}

/**
 * @param {string} text
 * @returns {Promise<Float32Array>}
 */
async function embedQuery(text) {
  const q = truncateForEmbed(String(text || '').trim());
  if (!q) {
    return new Float32Array(EMBED_DIM);
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
    return rows[0] || new Float32Array(EMBED_DIM);
  });
}

/**
 * @param {Float32Array} arr
 * @returns {Buffer}
 */
function floatsToBlob(arr) {
  const f = arr instanceof Float32Array ? arr : Float32Array.from(arr);
  return Buffer.from(f.buffer, f.byteOffset, f.byteLength);
}

/**
 * @param {Buffer | Uint8Array} buf
 * @returns {Float32Array}
 */
function blobToFloats(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
}

function resetForTests() {
  resetPipeline();
}

module.exports = {
  configureTransformersEnv,
  embedDocuments,
  embedQuery,
  floatsToBlob,
  blobToFloats,
  MODEL_VERSION,
  NOMIC_MODEL_ID,
  EMBED_DIM,
  EMBED_BATCH,
  MAX_INPUT_CHARS,
  resetPipeline,
  resetForTests,
};
