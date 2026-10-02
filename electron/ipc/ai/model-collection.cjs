'use strict';
const { z } = require('zod');
const collection = require('../../ai/model-collection.cjs');
const Selection = z.object({ provider: z.string().min(1).max(100), model: z.string().min(1).max(250) }).strict();
const Config = z.object({ image: Selection.optional(), classifier: Selection.optional() }).strict();
const Model = z.object({ id: z.string().min(1).max(250), name: z.string().min(1).max(250), type: z.enum(['chat', 'image', 'classifier']).default('chat'),
  api: z.string().min(1).max(100), baseUrl: z.string().url(), input: z.array(z.enum(['text', 'image'])).min(1).max(2),
  reasoning: z.boolean().optional(), contextWindow: z.number().int().positive().optional(), maxTokens: z.number().int().positive().optional(),
  output: z.array(z.enum(['text', 'image'])).optional() }).strict();
const Custom = z.object({ id: z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/), name: z.string().min(1).max(100), models: z.array(Model).min(1).max(100), apiKey: z.string().max(10000).optional() }).strict();
function register({ ipcMain, database, windowManager }) {
  const handler = (schema, operation) => async (event, raw) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    try { return await operation(schema.parse(raw)); } catch (error) { return { success: false, error: error.message }; }
  };
  ipcMain.handle('ai:capability-catalog', handler(z.object({ refresh: z.boolean().default(false) }).strict(), async args => {
    const models = await collection.getModelCollection(database);
    let diagnostics = [];
    if (args.refresh) { const result = await models.refresh({ allowNetwork: true, force: true, signal: AbortSignal.timeout(45000) }); diagnostics = [...result.errors].map(([provider, error]) => ({ provider, error: error.message })); }
    const available = new Set((await models.getAllAvailable()).map(model => `${model.type || 'chat'}:${model.provider}:${model.id}`));
    const catalog = models.getAllModels().map(model => ({ id: model.id, provider: model.provider, name: model.name, type: model.type || 'chat',
      input: model.input, reasoning: model.reasoning, contextWindow: model.contextWindow, available: available.has(`${model.type || 'chat'}:${model.provider}:${model.id}`) }));
    const queries = database.getQueries();
    const selected = Object.fromEntries(['image', 'classifier'].map(type => [type, { provider: queries.getSetting.get(`ai_${type}_provider`)?.value || '', model: queries.getSetting.get(`ai_${type}_model`)?.value || '' }]));
    return { success: true, data: { models: catalog, providers: models.getProviders().map(provider => ({ id: provider.id, name: provider.name, oauth: Boolean(provider.auth?.oauth), apiKey: Boolean(provider.auth?.apiKey?.login) })), selected, diagnostics } };
  }));
  ipcMain.handle('ai:capability-configure', handler(Config, async args => {
    const models = await collection.getModelCollection(database);
    for (const [type, selected] of Object.entries(args)) if (!models.getModelOfType(type, selected.provider, selected.model)) throw new Error(`Unknown ${type} model`);
    for (const [type, selected] of Object.entries(args)) for (const key of ['provider', 'model']) database.getQueries().setSetting.run(`ai_${type}_${key}`, selected[key], Date.now());
    return { success: true };
  }));
  ipcMain.handle('ai:provider-configure', handler(Custom, async args => {
    const ai = await import('@dome/ai');
    const models = await collection.getModelCollection(database);
    const { apiKey, ...config } = args;
    if (ai.builtinProviders().some(provider => provider.id === args.id)) throw new Error('Custom provider IDs must not replace a built-in provider');
    config.models = config.models.map(model => ({ ...model, provider: args.id, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: model.contextWindow || 32768, maxTokens: model.maxTokens || 4096, reasoning: model.reasoning || false }));
    const provider = collection.createCustomProvider(ai, config);
    const queries = database.getQueries();
    const custom = JSON.parse(queries.getSetting.get('ai_custom_providers')?.value || '[]').filter(provider => provider.id !== args.id);
    custom.push(config); queries.setSetting.run('ai_custom_providers', JSON.stringify(custom), Date.now());
    if (apiKey !== undefined) require('../../ai/provider-keys.cjs').writeProviderApiKey(queries, args.id, apiKey);
    models.setProvider(provider); return { success: true };
  }));
  ipcMain.handle('ai:chat-model-select', handler(Selection, async args => {
    const models = await collection.getModelCollection(database);
    const model = models.getModel(args.provider, args.model);
    if (!model) throw new Error('Unknown chat model');
    const queries = database.getQueries();
    queries.setSetting.run('ai_provider', args.provider, Date.now());
    queries.setSetting.run('ai_model', args.model, Date.now());
    require('../../ai/provider-keys.cjs').writeProviderBaseUrl(queries, args.provider, model.baseUrl);
    require('../../ai/model-input.cjs').persistModelInputs(queries, args.provider, model.baseUrl, [model]);
    return { success: true };
  }));
  ipcMain.handle('ai:provider-key', handler(z.object({ provider: z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/), apiKey: z.string().min(1).max(10000) }).strict(), async args => {
    const models = await collection.getModelCollection(database);
    if (!models.getProvider(args.provider)) throw new Error('Unknown provider');
    require('../../ai/provider-keys.cjs').writeProviderApiKey(database.getQueries(), args.provider, args.apiKey);
    return { success: true };
  }));
}
module.exports = { register, Config, Custom };
