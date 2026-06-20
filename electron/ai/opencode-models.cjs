/* eslint-disable no-console */
/**
 * OpenCode Zen / Go model catalog from @dome/ai (local, no remote /models API).
 */
'use strict';

const CURATED_IDS = {
  opencode: new Set(['claude-sonnet-4-5', 'claude-haiku-4-5', 'gpt-5.2', 'gemini-3-flash', 'big-pickle']),
  'opencode-go': new Set([
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'kimi-k2.6',
    'minimax-m3',
    'qwen3.7-plus',
    'glm-5.2',
  ]),
};

/**
 * @param {string} provider
 * @returns {Promise<NormalizedModel[]>}
 */
async function listOpenCodeModels(provider) {
  const normalized = String(provider || '').trim().toLowerCase();
  if (normalized !== 'opencode' && normalized !== 'opencode-go') {
    return [];
  }

  const ai = await import('@dome/ai');
  const catalogKey = normalized === 'opencode' ? 'opencode' : 'opencode-go';
  const models = ai.getModels(catalogKey);
  const curated = CURATED_IDS[catalogKey] || new Set();

  return models.map((m) => ({
    id: m.id,
    name: m.name || m.id,
    contextWindow: m.contextWindow ?? 128000,
    reasoning: Boolean(m.reasoning),
    input: Array.isArray(m.input) ? [...m.input] : ['text'],
    maxTokens: m.maxTokens ?? 8192,
    recommended: curated.has(m.id),
    api: m.api ?? 'openai-completions',
  }));
}

/**
 * Resolve model input types and API from catalog (for multimodal).
 * @param {string} provider
 * @param {string} modelId
 * @returns {Promise<{ input: string[], api: string } | null>}
 */
async function resolveOpenCodeModelMeta(provider, modelId) {
  const normalized = String(provider || '').trim().toLowerCase();
  if (normalized !== 'opencode' && normalized !== 'opencode-go') return null;
  const id = String(modelId || '').trim();
  if (!id) return null;
  try {
    const ai = await import('@dome/ai');
    const catalogKey = normalized === 'opencode' ? 'opencode' : 'opencode-go';
    const model = ai.getModel(catalogKey, id);
    if (!model) return null;
    return {
      input: Array.isArray(model.input) ? [...model.input] : ['text'],
      api: model.api || 'openai-completions',
    };
  } catch {
    return null;
  }
}

module.exports = {
  listOpenCodeModels,
  resolveOpenCodeModelMeta,
  CURATED_IDS,
};
