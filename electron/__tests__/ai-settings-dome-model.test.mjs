import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  coerceDomeCloudModel,
  resolveEffectiveProvider,
  resolveSubscriptionOAuthSettings,
} = require('../ai/ai-settings.cjs');
const { DEFAULT_MODELS } = require('../ai/model-factory.cjs');

describe('coerceDomeCloudModel', () => {
  it('keeps dome/auto and OpenRouter-shaped catalog ids', () => {
    assert.equal(coerceDomeCloudModel('dome/auto'), 'dome/auto');
    assert.equal(coerceDomeCloudModel('openai/gpt-5-nano'), 'openai/gpt-5-nano');
    assert.equal(coerceDomeCloudModel('anthropic/claude-sonnet-5'), 'anthropic/claude-sonnet-5');
  });

  it('rewrites bare OpenAI ids that cause 403 model_not_in_plan on Dome Cloud', () => {
    assert.equal(coerceDomeCloudModel('gpt-5.6-luna'), 'dome/auto');
    assert.equal(coerceDomeCloudModel('gpt-5.6-sol'), 'dome/auto');
    assert.equal(coerceDomeCloudModel(''), 'dome/auto');
    assert.equal(coerceDomeCloudModel(null), 'dome/auto');
  });
});

describe('resolveEffectiveProvider', () => {
  it('never hijacks ChatGPT Codex / Claude OAuth when billing defaults to dome_cloud', () => {
    assert.equal(resolveEffectiveProvider('dome_cloud', 'openai-codex'), 'openai-codex');
    assert.equal(resolveEffectiveProvider('dome_cloud', 'claude-oauth'), 'claude-oauth');
    assert.equal(resolveEffectiveProvider('dome_cloud', 'copilot'), 'copilot');
    assert.equal(resolveEffectiveProvider('dome_cloud', 'openai'), 'openai');
  });

  it('uses Dome only when ai_provider is dome (or custom_api_key fallback to openai)', () => {
    assert.equal(resolveEffectiveProvider('dome_cloud', 'dome'), 'dome');
    assert.equal(resolveEffectiveProvider('custom_api_key', 'dome'), 'openai');
  });
});

function makeQueries(aiModel) {
  return {
    getSetting: {
      get(key) {
        if (key === 'ai_model') return aiModel == null ? undefined : { value: aiModel };
        return undefined;
      },
    },
  };
}

describe('resolveSubscriptionOAuthSettings', () => {
  it('returns live token and baseUrl when getAccessToken succeeds', async () => {
    const oauthModule = {
      DEFAULT_BASE_URL: 'https://api.example.test',
      getAccessToken: mock.fn(async () => ({
        token: 'tok-live',
        baseUrl: 'https://live.example.test',
      })),
    };

    const result = await resolveSubscriptionOAuthSettings(
      {},
      makeQueries('claude-sonnet-5'),
      'claude-oauth',
      oauthModule,
      'dome_cloud',
    );

    assert.deepEqual(result, {
      provider: 'claude-oauth',
      apiKey: 'tok-live',
      model: 'claude-sonnet-5',
      baseUrl: 'https://live.example.test',
      billingMode: 'dome_cloud',
    });
    assert.equal(oauthModule.getAccessToken.mock.callCount(), 1);
  });

  it('falls back to DEFAULT_BASE_URL without a key when getAccessToken throws', async () => {
    const oauthModule = {
      DEFAULT_BASE_URL: 'https://chatgpt.com/backend-api',
      getAccessToken: mock.fn(async () => {
        throw new Error('not signed in');
      }),
    };

    const result = await resolveSubscriptionOAuthSettings(
      {},
      makeQueries(undefined),
      'openai-codex',
      oauthModule,
      'dome_cloud',
    );

    assert.deepEqual(result, {
      provider: 'openai-codex',
      apiKey: undefined,
      model: DEFAULT_MODELS['openai-codex'],
      baseUrl: 'https://chatgpt.com/backend-api',
      billingMode: 'dome_cloud',
    });
  });
});
