import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, Module } from 'node:module';

const require = createRequire(import.meta.url);
const authPath = require.resolve('../auth/dome-oauth.cjs');
const previousAuth = require.cache[authPath];
const calls = [];
const authStub = new Module(authPath);
authStub.exports = {
  getDomeProviderBaseUrl: () => 'https://dome-provider.test',
  fetchWithDomeAuth: async (_database, url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ url, method: options.method, body });
    if (url.endsWith('/model-binding') && options.method !== 'POST') {
      return {
        ok: true,
        json: async () => ({
          provider: null,
          customProviders: [{
            id: 'acme',
            secret: 'do-not-forward',
            models: [{ id: 'chat', baseUrl: 'https://acme.example/v1', extra: true }],
          }],
        }),
      };
    }
    if (url.endsWith('/model-binding')) {
      return { ok: true, json: async () => ({ provider: body.provider, model: body.model, hasApiKey: Boolean(body.apiKey) }) };
    }
    if (options.method === 'POST' && url.endsWith('/api/v1/manys')) {
      return {
        ok: true,
        json: async () => ({
          id: '11111111-1111-4111-8111-111111111111',
          name: body.name,
          instructions: body.instructions ?? '',
          grants: body.grants ?? { projects: [], resources: [], capabilities: [] },
          grant_revision: 1,
        }),
      };
    }
    throw new Error(`unexpected ${options.method} ${url}`);
  },
};
require.cache[authPath] = authStub;
const clientPath = require.resolve('../agents/manys-client.cjs');
delete require.cache[clientPath];
const { createCloudMany } = require('../agents/manys-client.cjs');

function memoryQueries(initial = {}) {
  const values = { ...initial };
  return {
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

function databaseFor(values) {
  return { getQueries: () => memoryQueries(values) };
}

describe('create cloud many', { concurrency: 1 }, () => {
test('a saved cloud key is bound before create, and create itself carries no runtime', async () => {
  calls.length = 0;
  const created = await createCloudMany(databaseFor({ ai_api_key_minimax: 'sk-minimax' }), {
    name: 'Miguel',
    instructions: 'Investiga',
    runtime: { source: 'provider_key', provider: 'minimax', apiKey: 'sk-minimax' },
    apiKey: 'sk-minimax',
  });
  assert.deepEqual(calls.map((call) => `${call.method} ${call.url}`), [
    'GET https://dome-provider.test/api/v1/manys/model-binding',
    'POST https://dome-provider.test/api/v1/manys/model-binding',
    'POST https://dome-provider.test/api/v1/manys',
  ]);
  const binding = calls[1].body;
  assert.equal(binding.provider, 'minimax');
  assert.equal(binding.model, 'MiniMax-M3');
  assert.equal(binding.apiKey, 'sk-minimax');
  assert.equal(Object.hasOwn(binding, 'baseUrl'), false);
  assert.equal(Object.hasOwn(binding, 'runtime'), false);
  assert.deepEqual(binding.customProviders, [{
    id: 'acme',
    models: [{ id: 'chat', baseUrl: 'https://acme.example/v1' }],
  }]);
  const create = calls[2].body;
  assert.deepEqual(create, { name: 'Miguel', instructions: 'Investiga' });
  assert.equal(JSON.stringify(create).includes('sk-'), false);
  assert.equal(JSON.stringify(create).includes('runtime'), false);
  assert.deepEqual(created.runtime, { source: 'provider_key', provider: 'minimax' });
});

test('a public saved base URL is included on the binding and not on create', async () => {
  calls.length = 0;
  await createCloudMany(databaseFor({
    ai_api_key_openai: 'sk-openai',
    ai_base_url_openai: 'https://proxy.example/v1/',
  }), {
    name: 'Ada',
    runtime: { source: 'provider_key', provider: 'openai' },
  });
  assert.equal(calls[1].body.baseUrl, 'https://proxy.example/v1');
  assert.equal(calls[1].body.apiKey, 'sk-openai');
  assert.equal(Object.hasOwn(calls[2].body, 'baseUrl'), false);
  assert.equal(Object.hasOwn(calls[2].body, 'apiKey'), false);
});

test('dome credits bind the hosted model and still create without runtime', async () => {
  calls.length = 0;
  await createCloudMany(databaseFor(), {
    name: 'Ada',
    runtime: { source: 'dome_credits' },
  });
  assert.equal(calls[1].body.provider, 'dome');
  assert.equal(calls[1].body.model, 'dome/auto');
  assert.equal(Object.hasOwn(calls[1].body, 'apiKey'), false);
  assert.equal(calls[1].body.customProviders[0].id, 'acme');
  assert.deepEqual(calls[2].body, { name: 'Ada' });
});

test('an unusable runtime never calls the provider', async () => {
  calls.length = 0;
  await assert.rejects(
    () => createCloudMany(databaseFor(), { name: 'Ada' }),
    /invalid_runtime/,
  );
  await assert.rejects(
    () => createCloudMany(databaseFor(), {
      name: 'Ada',
      runtime: { source: 'provider_key', provider: 'minimax' },
    }),
    /provider_not_cloud_compatible/,
  );
  assert.equal(calls.length, 0);
});

test('a rejected model binding does not create the collaborator', async () => {
  calls.length = 0;
  const original = authStub.exports.fetchWithDomeAuth;
  authStub.exports.fetchWithDomeAuth = async (_database, url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ url, method: options.method, body });
    if (options.method === 'POST' && url.endsWith('/model-binding')) {
      return { ok: false, json: async () => ({ error: 'invalid_request' }) };
    }
    if (url.endsWith('/model-binding')) return { ok: true, json: async () => ({ customProviders: [] }) };
    throw new Error(`unexpected ${options.method} ${url}`);
  };
  try {
    await assert.rejects(
      () => createCloudMany(databaseFor({ ai_api_key_minimax: 'sk-minimax' }), {
        name: 'Miguel',
        runtime: { source: 'provider_key', provider: 'minimax' },
      }),
      /invalid_request/,
    );
    assert.deepEqual(calls.map((call) => call.method), ['GET', 'POST']);
    assert.equal(calls.some((call) => call.url.endsWith('/api/v1/manys') && !call.url.includes('model-binding')), false);
  } finally {
    authStub.exports.fetchWithDomeAuth = original;
  }
});
});

after(() => {
  if (previousAuth) require.cache[authPath] = previousAuth;
  else delete require.cache[authPath];
});
