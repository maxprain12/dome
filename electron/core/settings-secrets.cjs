/**
 * Read/write encrypted settings values (lazy migration from plaintext).
 */
const { encryptSecret, decryptSecret, isEncryptedSecret, maskSecret } = require('./secret-storage.cjs');

const SECRET_KEYS = new Set([
  'ai_api_key',
  'openai_api_key',
  'ollama_api_key',
  'embeddings_api_key',
  'transcription_openai_api_key',
  'transcription_groq_api_key',
  'copilot_github_token',
  'claude_oauth_credentials',
  'openai_codex_oauth_credentials',
]);

function isSecretSettingKey(key) {
  if (!key || typeof key !== 'string') return false;
  return (
    SECRET_KEYS.has(key) ||
    key.endsWith('_api_key') ||
    key.endsWith('_token') ||
    // Per-provider slots: ai_api_key_openai, ai_api_key_minimax, …
    key.startsWith('ai_api_key_')
  );
}

function readSettingSecret(queries, key) {
  const row = queries.getSetting.get(key);
  if (!row?.value) return null;
  const stored = String(row.value);
  const plain = decryptSecret(stored);
  if (plain && !isEncryptedSecret(stored)) {
    try {
      queries.setSetting.run(key, encryptSecret(plain), Date.now());
    } catch {
      /* non-fatal */
    }
  }
  return plain && plain.trim() ? plain.trim() : null;
}

function writeSettingSecret(queries, key, plain) {
  const ts = Date.now();
  if (plain == null || String(plain).trim() === '') {
    queries.setSetting.run(key, '', ts);
    return;
  }
  queries.setSetting.run(key, encryptSecret(String(plain).trim()), ts);
}

function maskSettingForRenderer(queries, key) {
  const plain = readSettingSecret(queries, key);
  if (!plain) return null;
  return maskSecret(plain);
}

/** True when value is a display-only mask (not a real secret). */
function isMaskedSecret(value) {
  if (!value || typeof value !== 'string') return false;
  const s = value.trim();
  if (s === '••••••••') return true;
  return /^.{1,3}\u2026.{4}$/.test(s) || /^.{1,3}\.{3}.{4}$/.test(s);
}

/**
 * Prefer a fresh plaintext candidate from the renderer; otherwise read decrypted storage.
 * Ignores masked placeholders so HTTP headers never receive Unicode ellipsis.
 */
function resolveSettingSecretForApi(queries, key, candidate) {
  const trimmed = String(candidate ?? '').trim();
  if (trimmed && !isMaskedSecret(trimmed)) return trimmed;
  return readSettingSecret(queries, key) || '';
}

function encryptSessionField(value) {
  if (!value) return null;
  return encryptSecret(String(value));
}

function decryptSessionField(value) {
  if (!value) return null;
  const plain = decryptSecret(String(value));
  return plain && plain.trim() ? plain.trim() : null;
}

module.exports = {
  isSecretSettingKey,
  readSettingSecret,
  writeSettingSecret,
  maskSettingForRenderer,
  isMaskedSecret,
  resolveSettingSecretForApi,
  encryptSessionField,
  decryptSessionField,
};
