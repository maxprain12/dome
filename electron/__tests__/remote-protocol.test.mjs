import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  COMMAND_TYPES,
  EVENT_TYPES,
  AGENT_MODES,
  PROTOCOL_VERSION,
  isCommandType,
  isEventType,
  isAgentMode,
  isEnvelope,
} = require('../remote/protocol.cjs');

const spec = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../shared/remote-many/protocol.json'), 'utf8'),
);

describe('remote-many protocol contract', () => {
  it('loads the shared JSON as the runtime source of truth', () => {
    assert.equal(PROTOCOL_VERSION, spec.version);
    assert.deepEqual([...COMMAND_TYPES], spec.commandTypes);
    assert.deepEqual([...EVENT_TYPES], spec.eventTypes);
    assert.deepEqual([...AGENT_MODES], spec.agentModes);
  });

  it('includes refs.*, mode.set, plan and visual', () => {
    assert.equal(isCommandType('refs.list'), true);
    assert.equal(isCommandType('refs.preview'), true);
    assert.equal(isCommandType('refs.export'), true);
    assert.equal(isCommandType('mode.set'), true);
    assert.equal(isCommandType('session.get'), true);
    assert.equal(isEventType('plan'), true);
    assert.equal(isEventType('visual'), true);
    assert.equal(isEventType('refs'), true);
    assert.equal(isAgentMode('plan'), true);
    assert.equal(isAgentMode('draft'), true);
    assert.equal(isAgentMode('agent'), true);
    assert.equal(isCommandType('session.ping'), false);
  });

  it('still rejects a malformed envelope', () => {
    assert.equal(isEnvelope({ v: PROTOCOL_VERSION, kid: 'k', nonce: 'n', ciphertext: 'c' }), true);
    assert.equal(isEnvelope({ v: PROTOCOL_VERSION, kid: '', nonce: 'n', ciphertext: 'c' }), false);
  });
});
