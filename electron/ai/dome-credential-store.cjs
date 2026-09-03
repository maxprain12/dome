'use strict';

/**
 * CredentialStore backed by Dome encrypted settings — not PI's file store.
 * Keyed by PI provider id (openai, anthropic, github-copilot, openai-codex, …).
 */

const { readProviderApiKey, writeProviderApiKey } = require('./provider-keys.cjs');
const { readSettingSecret, writeSettingSecret } = require('../core/settings-secrets.cjs');

const OAUTH_SETTINGS = {
  anthropic: 'claude_oauth_credentials',
  'openai-codex': 'openai_codex_oauth_credentials',
};

const COPILOT_GH_TOKEN = 'copilot_github_token';

function getQueries(database) {
  if (database && typeof database.getQueries === 'function') return database.getQueries();
  return require('../core/database.cjs').getQueries();
}

function parseOAuthJson(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.access === 'string' &&
      typeof parsed.refresh === 'string' &&
      typeof parsed.expires === 'number'
    ) {
      return {
        type: 'oauth',
        access: parsed.access,
        refresh: parsed.refresh,
        expires: parsed.expires,
        ...(typeof parsed.accountId === 'string' ? { accountId: parsed.accountId } : {}),
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function createDomeCredentialStore(database) {
  const chains = new Map();

  function enqueue(providerId, task) {
    const previous = chains.get(providerId) ?? Promise.resolve();
    const queued = previous.catch(() => {}).then(task);
    const tail = queued.catch(() => {});
    chains.set(providerId, tail);
    return queued;
  }

  async function read(providerId) {
    if (providerId === 'github-copilot') {
      const ghToken = getQueries(database).getSetting.get(COPILOT_GH_TOKEN)?.value;
      if (!ghToken) return undefined;
      return {
        type: 'oauth',
        refresh: String(ghToken),
        access: '',
        expires: 0,
      };
    }
    const oauthKey = OAUTH_SETTINGS[providerId];
    if (oauthKey) {
      const oauth = parseOAuthJson(readSettingSecret(getQueries(database), oauthKey));
      if (oauth) return oauth;
    }
    const key = readProviderApiKey(getQueries(database), providerId);
    if (key) return { type: 'api_key', key };
    return undefined;
  }

  async function list() {
    const ids = [
      'openai',
      'anthropic',
      'google',
      'openrouter',
      'minimax',
      'github-copilot',
      'openai-codex',
      'ollama',
    ];
    const out = [];
    for (const providerId of ids) {
      const credential = await read(providerId);
      if (credential) out.push({ providerId, type: credential.type });
    }
    return out;
  }

  async function persist(providerId, credential) {
    if (!credential) return;
    if (credential.type === 'oauth') {
      if (providerId === 'github-copilot' && credential.refresh) {
        getQueries(database).setSetting.run(COPILOT_GH_TOKEN, credential.refresh, Date.now());
        return;
      }
      const oauthKey = OAUTH_SETTINGS[providerId];
      if (oauthKey) {
        writeSettingSecret(
          getQueries(database),
          oauthKey,
          JSON.stringify({
            access: credential.access,
            refresh: credential.refresh,
            expires: credential.expires,
            accountId: typeof credential.accountId === 'string' ? credential.accountId : undefined,
          }),
        );
      }
      return;
    }
    if (credential.type === 'api_key' && credential.key) {
      writeProviderApiKey(getQueries(database), providerId, credential.key);
    }
  }

  return {
    read,
    list,
    modify(providerId, fn) {
      return enqueue(providerId, async () => {
        const current = await read(providerId);
        const next = await fn(current);
        if (next !== undefined) await persist(providerId, next);
        return next ?? current;
      });
    },
    delete(providerId) {
      return enqueue(providerId, async () => {
        if (providerId === 'github-copilot') {
          getQueries(database).setSetting.run(COPILOT_GH_TOKEN, '', Date.now());
          return;
        }
        const oauthKey = OAUTH_SETTINGS[providerId];
        if (oauthKey) writeSettingSecret(getQueries(database), oauthKey, '');
        writeProviderApiKey(getQueries(database), providerId, '');
      });
    },
  };
}

module.exports = { createDomeCredentialStore };
