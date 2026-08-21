import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { coerceDomeCloudModel, resolveEffectiveProvider } = require('../ai/ai-settings.cjs');

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
