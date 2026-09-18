'use strict';

const crypto = require('node:crypto');
const { HKDF_INFO, PROTOCOL_VERSION } = require('./protocol.cjs');

function toB64Url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function fromB64Url(value) {
  return Buffer.from(String(value), 'base64url');
}

function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return {
    publicKey: toB64Url(publicKey.export({ type: 'spki', format: 'der' })),
    privateKey: toB64Url(privateKey.export({ type: 'pkcs8', format: 'der' })),
  };
}

function loadPrivateKey(privateKeyB64) {
  return crypto.createPrivateKey({
    key: fromB64Url(privateKeyB64),
    format: 'der',
    type: 'pkcs8',
  });
}

function loadPublicKey(publicKeyB64) {
  return crypto.createPublicKey({
    key: fromB64Url(publicKeyB64),
    format: 'der',
    type: 'spki',
  });
}

function deriveSharedKey(privateKeyB64, peerPublicKeyB64, pairingId) {
  const secret = crypto.diffieHellman({
    privateKey: loadPrivateKey(privateKeyB64),
    publicKey: loadPublicKey(peerPublicKeyB64),
  });
  return crypto.hkdfSync('sha256', secret, Buffer.from(String(pairingId), 'utf8'), HKDF_INFO, 32);
}

function encryptEnvelope(aesKey, pairingId, plaintext) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, nonce);
  const body = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(plaintext), 'utf8')),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    v: PROTOCOL_VERSION,
    kid: pairingId,
    nonce: toB64Url(nonce),
    ciphertext: toB64Url(Buffer.concat([body, tag])),
  };
}

function decryptEnvelope(aesKey, envelope) {
  const packed = fromB64Url(envelope.ciphertext);
  if (packed.length < 17) throw new Error('ciphertext_too_short');
  const tag = packed.subarray(packed.length - 16);
  const body = packed.subarray(0, packed.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, fromB64Url(envelope.nonce));
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  return JSON.parse(plain);
}

module.exports = {
  generateKeyPair,
  deriveSharedKey,
  encryptEnvelope,
  decryptEnvelope,
};
