import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  isLocalCompatChatModel,
  formatLocalCompatFetchError,
  fetchOpenAiCompatModels,
} = require('../ai/provider-models.cjs');
const {
  extractContextWindowFromRow,
  parseContextWindow,
  LOCAL_CHAT_CONTEXT_FALLBACK,
} = require('../ai/context-window.cjs');

describe('isLocalCompatChatModel', () => {
  it('keeps LM Studio and vLLM chat ids that OpenAI catalog filter would drop', () => {
    assert.equal(isLocalCompatChatModel('lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF'), true);
    assert.equal(isLocalCompatChatModel('qwen2.5-7b-instruct'), true);
    assert.equal(isLocalCompatChatModel('meta-llama/Llama-3.1-8B-Instruct'), true);
    assert.equal(isLocalCompatChatModel('openai/gpt-oss-20b'), true);
  });

  it('drops non-chat endpoints', () => {
    assert.equal(isLocalCompatChatModel('text-embedding-nomic'), false);
    assert.equal(isLocalCompatChatModel('nomic-embed-text'), false);
    assert.equal(isLocalCompatChatModel('whisper-1'), false);
    assert.equal(isLocalCompatChatModel('tts-1'), false);
    assert.equal(isLocalCompatChatModel(''), false);
  });
});

describe('formatLocalCompatFetchError', () => {
  it('explains ECONNREFUSED instead of raw fetch failed', () => {
    const err = Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    const msg = formatLocalCompatFetchError(err, 'vllm', 'http://127.0.0.1:8000/v1');
    assert.match(msg, /vLLM is not reachable/);
    assert.match(msg, /127\.0\.0\.1:8000/);
  });

  it('labels LM Studio connection resets', () => {
    const err = Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } });
    const msg = formatLocalCompatFetchError(err, 'lmstudio', 'http://127.0.0.1:1234/v1');
    assert.match(msg, /LM Studio/);
    assert.match(msg, /reset/);
  });

  it('rewrites the OpenAI SDK Connection error into a reachability hint', () => {
    const msg = formatLocalCompatFetchError(
      new Error('Connection error.'),
      'lmstudio',
      'http://127.0.0.1:1234/v1',
    );
    assert.match(msg, /LM Studio is not reachable/);
    assert.match(msg, /1234/);
  });
});

describe('fetchOpenAiCompatModels', () => {
  /** @type {typeof fetch | undefined} */
  let previousFetch;

  beforeEach(() => {
    previousFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = previousFetch;
  });

  it('maps LM Studio /v1/models rows that are not gpt-* ids', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          object: 'list',
          data: [
            { id: 'lmstudio-community/gemma-2-9b-it-GGUF', object: 'model' },
            { id: 'nomic-embed-text', object: 'model' },
            { id: 'qwen2.5-7b-instruct', object: 'model' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );

    const result = await fetchOpenAiCompatModels('', 'http://127.0.0.1:1234/v1', 'lmstudio');
    assert.equal(result.success, true);
    const ids = (result.models || []).map((m) => m.id).sort((a, b) => a.localeCompare(b));
    assert.deepEqual(ids, [
      'lmstudio-community/gemma-2-9b-it-GGUF',
      'qwen2.5-7b-instruct',
    ]);
    for (const model of result.models || []) {
      assert.equal(model.contextWindow, LOCAL_CHAT_CONTEXT_FALLBACK);
    }
  });

  it('reads max_model_len from a vLLM /v1/models row', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          object: 'list',
          data: [{ id: 'meta-llama/Llama-3.1-8B-Instruct', max_model_len: 8192 }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );

    const result = await fetchOpenAiCompatModels('', 'http://127.0.0.1:8000/v1', 'vllm');
    assert.equal(result.success, true);
    assert.equal(result.models?.[0]?.contextWindow, 8192);
  });

  it('merges LM Studio /api/v0 max_context_length onto /v1 rows', async () => {
    globalThis.fetch = async (url) => {
      const href = String(url);
      if (href.includes('/api/v0/models')) {
        return new Response(
          JSON.stringify({
            data: [{ id: 'qwen2.5-7b-instruct', max_context_length: 4096 }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          object: 'list',
          data: [{ id: 'qwen2.5-7b-instruct', object: 'model' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const result = await fetchOpenAiCompatModels('', 'http://127.0.0.1:1234/v1', 'lmstudio');
    assert.equal(result.success, true);
    assert.equal(result.models?.[0]?.contextWindow, 4096);
  });

  it('turns connection refusal into a vLLM-specific error', async () => {
    globalThis.fetch = async () => {
      throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    };
    const result = await fetchOpenAiCompatModels('', 'http://127.0.0.1:8000/v1', 'vllm');
    assert.equal(result.success, false);
    assert.match(result.error || '', /vLLM is not reachable/);
  });
});

describe('extractContextWindowFromRow', () => {
  it('reads vLLM and LM Studio fields and ignores junk', () => {
    assert.equal(extractContextWindowFromRow({ max_model_len: 8192 }), 8192);
    assert.equal(extractContextWindowFromRow({ max_context_length: 4096 }), 4096);
    assert.equal(extractContextWindowFromRow({ context_length: '16384' }), 16384);
    assert.equal(extractContextWindowFromRow({ id: 'x' }), 0);
    assert.equal(parseContextWindow('nope'), 0);
  });
});
