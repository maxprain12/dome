'use strict';
const { createHash } = require('node:crypto');
function key(provider, baseUrl = '') {
  return `model_input_${provider}_${createHash('sha256').update(baseUrl).digest('hex').slice(0, 16)}`;
}
function persistModelInputs(queries, provider, baseUrl, models) {
  const inputs = Object.fromEntries(models.map((m) => [m.id || m.name, m.input || ['text']]));
  queries.setSetting.run(key(provider, baseUrl), JSON.stringify(inputs), Date.now());
}
function resolveModelInput(provider, id, queries, baseUrl) {
  const ai = require('@dome/ai');
  if (!queries) {
    try { queries = require('../core/database.cjs').getQueries(); } catch { /* catalog alone */ }
  }
  if (!baseUrl && queries) baseUrl = provider === 'ollama' ? (queries.getSetting.get('ollama_base_url')?.value || 'http://localhost:11434') : (require('./provider-keys.cjs').readProviderBaseUrl(queries, provider) || require('./model-factory.cjs').DEFAULT_BASE_URLS[provider] || '');
  const raw = queries?.getSetting?.get?.(key(provider, baseUrl))?.value;
  if (raw) {
    const declared = JSON.parse(raw)[id];
    if (Array.isArray(declared)) return declared.filter((value) => ['text', 'image'].includes(value));
  }
  const aliases = { 'claude-oauth': 'anthropic', copilot: 'github-copilot' };
  const catalog = ai.getModels(aliases[provider] || provider).find((m) => m.id.toLowerCase() === String(id || '').toLowerCase());
  return catalog?.input || ai.resolveDomeModel({ provider, model: id }).input;
}
module.exports = { resolveModelInput, persistModelInputs };
