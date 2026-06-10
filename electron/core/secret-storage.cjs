/* eslint-disable no-console */
/**
 * Encrypt/decrypt secrets at rest via Electron safeStorage.
 */
const { safeStorage } = require('electron');

const ENC_PREFIX = 'enc:v1:';

function isEncryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function isEncryptedSecret(stored) {
  return typeof stored === 'string' && stored.startsWith(ENC_PREFIX);
}

function encryptSecret(plain) {
  if (plain == null || plain === '') return '';
  const text = String(plain);
  if (!isEncryptionAvailable()) {
    console.warn('[SecretStorage] safeStorage unavailable — storing secret in plaintext');
    return text;
  }
  try {
    const buf = safeStorage.encryptString(text);
    return ENC_PREFIX + buf.toString('base64');
  } catch (err) {
    console.warn('[SecretStorage] encrypt failed:', err?.message);
    return text;
  }
}

function decryptSecret(stored) {
  if (stored == null || stored === '') return '';
  const text = String(stored);
  if (!isEncryptedSecret(text)) return text;
  if (!isEncryptionAvailable()) {
    console.warn('[SecretStorage] cannot decrypt — safeStorage unavailable');
    return '';
  }
  try {
    const buf = Buffer.from(text.slice(ENC_PREFIX.length), 'base64');
    return safeStorage.decryptString(buf);
  } catch (err) {
    console.warn('[SecretStorage] decrypt failed:', err?.message);
    return '';
  }
}

function maskSecret(plain) {
  if (!plain || typeof plain !== 'string') return null;
  const s = plain.trim();
  if (s.length <= 8) return '••••••••';
  return `${s.slice(0, 3)}…${s.slice(-4)}`;
}

module.exports = {
  encryptSecret,
  decryptSecret,
  isEncryptedSecret,
  isEncryptionAvailable,
  maskSecret,
};
