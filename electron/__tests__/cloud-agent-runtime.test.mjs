import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  isMachineLocalBaseUrl,
  listCloudAgentProviders,
  prepareCloudManyCreate,
  acceptCreatedMany,
  publicManyError,
  forgetRuntime,
  readRuntime,
} = require('../ai/cloud-agent-runtime.cjs');

function memoryQueries(initial = {}) {
  const values = { ...initial };
  return {
    values,
    getSetting: {
      get(key) {
        return Object.prototype.hasOwnProperty.call(values, key) ? { value: values[key] } : undefined;
      },
    },
    setSetting: {
      run(key, value) {
        values[key] = value;
      },
    },
  };
}

test('machine-local base URLs cannot back a cloud agent', () => {
  for (const url of [
    'http://localhost:11434',
    'http://127.0.0.1:8000/v1',
    'http://127.0.0.2:1234/v1',
    'http://[::1]:11434',
    'http://0.0.0.0:11434',
    'http://10.0.0.8/v1',
    'http://192.168.1.20:11434',
    'http://172.16.0.4:8000/v1',
    'http://169.254.169.254',
    'http://[fe80::1]/',
    'http://[fd00::1]/v1',
    'http://macbook.local:11434',
    'http://ollama:11434',
    'http://host.docker.internal:11434',
    'not a url',
  ]) {
    assert.equal(isMachineLocalBaseUrl(url), true, url);
  }
  for (const url of [
    '',
    'https://api.openai.com/v1',
    'https://api.anthropic.com',
    'https://ollama.com',
    'https://api.groq.com/openai/v1',
    'http://8.8.8.8/v1',
  ]) {
    assert.equal(isMachineLocalBaseUrl(url), false, url);
  }
});

test('only saved API-key providers with a public base URL are offered', () => {
  const queries = memoryQueries({
    ai_api_key_openai: 'sk-openai',
    ai_api_key_anthropic: 'sk-anthropic',
    ai_api_key_ollama: 'should-not-count',
    ai_base_url_anthropic: 'http://127.0.0.1:8080',
    ai_api_key_vllm: 'sk-vllm',
    ai_base_url_vllm: 'http://192.168.0.9:8000/v1',
    ai_api_key_lmstudio: 'sk-lmstudio',
    ai_base_url_lmstudio: 'https://lmstudio.example.com/v1',
    ollama_base_url: 'https://ollama.com',
    ollama_api_key: 'sk-ollama',
    ai_provider: 'copilot',
    ai_api_key_copilot: 'not-an-api-key-provider',
  });
  const providers = listCloudAgentProviders(queries);
  assert.deepEqual(providers.map((provider) => provider.id), ['lmstudio', 'ollama', 'openai']);
  assert.deepEqual(providers.map((provider) => provider.name), ['LM Studio', 'Ollama', 'OpenAI']);
  assert.equal(JSON.stringify(providers).includes('sk-'), false);
});

test('create keeps the chosen runtime off the body Provider would reject', () => {
  const queries = memoryQueries({ ai_api_key_openai: 'sk-openai' });
  const credits = prepareCloudManyCreate(queries, { name: 'Ada', runtime: { source: 'dome_credits' } });
  assert.equal(credits.ok, true);
  assert.deepEqual(credits.body, { name: 'Ada' });
  assert.deepEqual(credits.runtime, { source: 'dome_credits' });
  assert.deepEqual(credits.binding, { provider: 'dome', model: 'dome/auto' });
  assert.equal(JSON.stringify(credits.binding).includes('sk-'), false);

  const saved = prepareCloudManyCreate(queries, {
    name: 'Ada',
    instructions: 'Investiga',
    apiKey: 'sk-openai',
    runtime: { source: 'provider_key', provider: 'openai', apiKey: 'sk-openai' },
  });
  assert.equal(saved.ok, true);
  assert.deepEqual(saved.body, { name: 'Ada', instructions: 'Investiga' });
  assert.equal(Object.hasOwn(saved.body, 'runtime'), false);
  assert.deepEqual(saved.runtime, { source: 'provider_key', provider: 'openai' });
  assert.equal(saved.binding.provider, 'openai');
  assert.equal(saved.binding.apiKey, 'sk-openai');
  assert.equal(JSON.stringify(saved.body).includes('sk-'), false);

  const local = prepareCloudManyCreate(queries, {
    name: 'Ada',
    runtime: { source: 'provider_key', provider: 'ollama' },
  });
  assert.deepEqual(local, { ok: false, error: 'provider_not_cloud_compatible' });

  const missing = prepareCloudManyCreate(queries, { name: 'Ada' });
  assert.deepEqual(missing, { ok: false, error: 'invalid_runtime' });
});

test('a connection failure is not the same code as a rejected request', () => {
  assert.equal(publicManyError(new Error('fetch failed')), 'service_unavailable');
  assert.equal(publicManyError(new Error('Dome provider is not connected.')), 'service_unavailable');
  assert.equal(publicManyError(new Error('invalid_request')), 'invalid_request');
  assert.equal(publicManyError(new Error('manys_unavailable')), 'service_unavailable');
});

test('the choice is stored on the created agent and replayed when the server omits it', () => {
  const queries = memoryQueries({ ai_api_key_openai: 'sk-openai' });
  const prepared = prepareCloudManyCreate(queries, {
    name: 'Ada',
    runtime: { source: 'provider_key', provider: 'openai' },
  });
  const created = acceptCreatedMany(queries, prepared.runtime, {
    id: 'many-1',
    name: 'Ada',
    instructions: '',
    grants: { projects: [], resources: [], capabilities: [] },
    grant_revision: 1,
    runtime: { source: 'provider_key', provider: 'openai', apiKey: 'sk-leaked' },
  });
  assert.deepEqual(created.runtime, { source: 'provider_key', provider: 'openai' });
  assert.equal(JSON.stringify(created).includes('sk-'), false);

  const listed = acceptCreatedMany(queries, null, {
    manys: [{ id: 'many-1', name: 'Ada', grants: { projects: [], resources: [], capabilities: [] } }],
  });
  assert.deepEqual(listed.manys[0].runtime, { source: 'provider_key', provider: 'openai' });
  assert.deepEqual(readRuntime(queries, 'many-1'), { source: 'provider_key', provider: 'openai' });
});

test('deleting a Many forgets only its remembered runtime', () => {
  const removed = [];
  const db = { prepare: (sql) => ({ run: (key) => removed.push([sql, key]) }) };
  forgetRuntime(db, 'many-1');
  forgetRuntime(db, '');
  assert.deepEqual(removed, [['DELETE FROM settings WHERE key=?', 'manys_runtime:many-1']]);
});
