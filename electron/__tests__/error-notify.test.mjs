import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { init, notifyError, classifyError, _resetThrottle } = require('../core/error-notify.cjs');

function makeFakeWindowManager() {
  const broadcasts = [];
  return {
    broadcasts,
    broadcast: (channel, payload) => broadcasts.push({ channel, payload }),
  };
}

describe('error-notify', () => {
  beforeEach(() => _resetThrottle());

  it('classifies common provider errors', () => {
    assert.equal(classifyError('401 Unauthorized: invalid api key'), 'invalid_api_key');
    assert.equal(classifyError('Rate limit exceeded (429)'), 'rate_limit');
    assert.equal(classifyError('The model `gpt-99` does not exist'), 'model_not_found');
    assert.equal(classifyError('fetch failed: ECONNREFUSED 127.0.0.1'), 'network');
    assert.equal(classifyError('maximum context length is 8192 tokens'), 'context_overflow');
    assert.equal(classifyError('something exploded'), 'unknown');
  });

  it('broadcasts a compact payload on system:error-notification', () => {
    const wm = makeFakeWindowManager();
    init(wm);
    notifyError({ scope: 'runs', message: 'invalid api key', runId: 'r1', title: 'My run' });
    assert.equal(wm.broadcasts.length, 1);
    const { channel, payload } = wm.broadcasts[0];
    assert.equal(channel, 'system:error-notification');
    assert.equal(payload.scope, 'runs');
    assert.equal(payload.code, 'invalid_api_key');
    assert.equal(payload.runId, 'r1');
    assert.equal(payload.title, 'My run');
  });

  it('throttles repeated errors per scope (1/min)', () => {
    const wm = makeFakeWindowManager();
    init(wm);
    notifyError({ scope: 'automations', message: 'boom 1' });
    notifyError({ scope: 'automations', message: 'boom 2' });
    notifyError({ scope: 'automations', message: 'boom 3' });
    assert.equal(wm.broadcasts.length, 1);
    // A different scope is not throttled by the first one
    notifyError({ scope: 'runs', message: 'other failure' });
    assert.equal(wm.broadcasts.length, 2);
  });

  it('does not crash when windowManager is missing', () => {
    init(null);
    assert.doesNotThrow(() => notifyError({ scope: 'runs', message: 'x' }));
  });
});
