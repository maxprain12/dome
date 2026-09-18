import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isEnvelope, isCommandType, PROTOCOL_VERSION } = require('../remote/protocol.cjs');
const { generateKeyPair, deriveSharedKey, encryptEnvelope, decryptEnvelope } = require('../remote/crypto.cjs');

describe('remote-many crypto', () => {
  it('round-trips an opaque command between two P-256 devices', () => {
    const desktop = generateKeyPair();
    const phone = generateKeyPair();
    const pairingId = 'pairing-test-1';
    const desktopKey = deriveSharedKey(desktop.privateKey, phone.publicKey, pairingId);
    const phoneKey = deriveSharedKey(phone.privateKey, desktop.publicKey, pairingId);
    assert.deepEqual(Buffer.from(desktopKey), Buffer.from(phoneKey));

    const envelope = encryptEnvelope(desktopKey, pairingId, {
      id: 'cmd-1',
      type: 'message.send',
      payload: { text: 'hola' },
    });
    assert.equal(envelope.v, PROTOCOL_VERSION);
    assert.equal(isEnvelope(envelope), true);
    assert.equal(JSON.stringify(envelope).includes('hola'), false);

    const plain = decryptEnvelope(phoneKey, envelope);
    assert.equal(plain.type, 'message.send');
    assert.equal(plain.payload.text, 'hola');
    assert.equal(isCommandType(plain.type), true);
  });
});
