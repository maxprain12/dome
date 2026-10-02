'use strict';
const { createDomeCredentialStore } = require('./dome-credential-store.cjs');
const collections = new WeakMap();
const credentialsByProfile = new WeakMap();
function credentialStoreFor(database) {
  if (!credentialsByProfile.has(database)) credentialsByProfile.set(database, createDomeCredentialStore(database));
  return credentialsByProfile.get(database);
}
function catalogStore(database) {
  const queries = database.getQueries();
  return {
    async read(provider, { signal } = {}) { signal?.throwIfAborted(); const raw = queries.getSetting.get(`ai_catalog_${provider}`)?.value; return raw ? JSON.parse(raw) : undefined; },
    async write(provider, entry, { signal } = {}) { signal?.throwIfAborted(); queries.setSetting.run(`ai_catalog_${provider}`, JSON.stringify(entry), Date.now()); },
    async delete(provider, { signal } = {}) { signal?.throwIfAborted(); queries.setSetting.run(`ai_catalog_${provider}`, '', Date.now()); },
  };
}
async function getModelCollection(database) {
  if (!collections.has(database)) collections.set(database, (async () => {
    const ai = await import('@dome/ai');
    const credentials = credentialStoreFor(database);
    const models = ai.createModels({ credentials, modelsStore: catalogStore(database), authContext: ai.defaultProviderAuthContext() });
    for (const provider of ai.builtinProviders()) models.setProvider(provider);
    const custom = JSON.parse(database.getQueries().getSetting.get('ai_custom_providers')?.value || '[]');
    for (const config of custom) models.setProvider(createCustomProvider(ai, config));
    await models.refresh({ allowNetwork: false });
    return models;
  })().catch(error => { collections.delete(database); throw error; }));
  return collections.get(database);
}
function createCustomProvider(ai, config) {
  const apis = {};
  const images = {};
  const classifiers = {};
  for (const model of config.models) {
    if (model.type === 'image') {
      if (model.api !== 'openrouter-images') throw new Error(`Unsupported custom image API: ${model.api}`);
      images[model.api] = { generateImages: async (...args) => (await import('@dome/ai/api/openrouter-images')).generateImages(...args) };
    } else if (model.type === 'classifier') {
      const allowed = ['typesafe-system-one', 'llama-cpp-classify', 'cloudflare-workers-ai-system-one'];
      if (!allowed.includes(model.api)) throw new Error(`Unsupported classifier API: ${model.api}`);
      classifiers[model.api] = { classify: async (...args) => (await import(`@dome/ai/api/${model.api}`)).classify(...args) };
    } else {
      const api = ai.getApiProvider(model.api);
      if (!api) throw new Error(`Unsupported chat API: ${model.api}`);
      apis[model.api] = api;
    }
  }
  const apiKey = ai.envApiKeyAuth(`${config.name || config.id} API key`, []);
  const local = config.models.every(model => require('./provider-keys.cjs').isLoopbackBaseUrl(model.baseUrl));
  if (local) {
    const resolve = apiKey.resolve;
    apiKey.resolve = async input => (await resolve(input)) || { auth: { apiKey: 'dome-local' }, source: 'local endpoint' };
  }
  return ai.createProvider({ ...config, auth: { apiKey }, api: apis, images, classifiers });
}
function ensureChatProvider(models, ai, model) {
  if (!models.getProvider(model.provider)) models.setProvider(ai.createProvider({ id: model.provider,
    auth: { apiKey: ai.envApiKeyAuth(`${model.provider} API key`, []) }, models: [model], api: ai.getApiProvider(model.api) }));
}
function invalidate(database) { collections.delete(database); }
module.exports = { credentialStoreFor, getModelCollection, ensureChatProvider, createCustomProvider, catalogStore, invalidate };
