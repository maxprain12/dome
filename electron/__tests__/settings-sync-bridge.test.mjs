import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isSyncableSettingKey, SYNCABLE_SETTING_KEYS } = require('../storage/settings-sync-bridge.cjs');

describe('settings-sync-bridge', () => {
  it('allows known AI preference keys', () => {
    assert.equal(SYNCABLE_SETTING_KEYS.has('ai_provider'), true);
    assert.equal(isSyncableSettingKey('ai_model'), true);
  });

  it('rejects secret-like keys', () => {
    assert.equal(isSyncableSettingKey('ai_api_key'), false);
    assert.equal(isSyncableSettingKey('openai_api_key'), false);
    assert.equal(isSyncableSettingKey('embeddings_api_key'), false);
  });

  it('rejects unknown non-secret keys by default', () => {
    assert.equal(isSyncableSettingKey('random_feature_flag'), false);
  });
});
