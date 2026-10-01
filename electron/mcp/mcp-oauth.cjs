'use strict';
const { randomBytes, createHash } = require('node:crypto');
const { auth } = require('@modelcontextprotocol/sdk/client/auth.js');
const { readSettingSecret, writeSettingSecret } = require('../core/settings-secrets.cjs');
const REDIRECT_BASE = 'dome://mcp-auth/oauth/callback';
const pending = new Map();
function credentialKey(serverUrl) {
  return `mcp_oauth_${createHash('sha256').update(serverUrl).digest('hex')}_token`;
}
function createAuthProvider(serverUrl, database, interactive = false) {
  const queries = () => database.getQueries();
  const key = credentialKey(serverUrl);
  const read = () => {
    const value = readSettingSecret(queries(), key);
    return value ? JSON.parse(value) : {};
  };
  const save = (patch) => writeSettingSecret(queries(), key, JSON.stringify({ ...read(), ...patch }));
  let verifier;
  const state = randomBytes(32).toString('base64url');
  return {
    redirectUrl: REDIRECT_BASE,
    clientMetadata: { client_name: 'Dome', redirect_uris: [REDIRECT_BASE],
      grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' },
    state: () => state,
    clientInformation: () => read().client,
    saveClientInformation: (client) => save({ client }),
    tokens: () => read().tokens,
    saveTokens: (tokens) => save({ tokens }),
    saveCodeVerifier: (value) => { verifier = value; },
    codeVerifier: () => { if (!verifier) throw new Error('No pending OAuth verifier'); return verifier; },
    redirectToAuthorization: async (url) => {
      if (!interactive) throw new Error('MCP authentication required. Sign in from MCP settings.');
      const entry = pending.get(state);
      if (!entry) throw new Error('OAuth session has expired');
      await require('electron').shell.openExternal(String(url));
    },
    invalidateCredentials: (scope) => {
      if (scope === 'all') { writeSettingSecret(queries(), key, ''); verifier = undefined; }
      else if (scope === 'client') save({ client: undefined });
      else if (scope === 'tokens') save({ tokens: undefined });
      else if (scope === 'verifier') verifier = undefined;
    },
  };
}
async function startOAuthFlow(serverId, database) {
  const row = database.getQueries().listMcpServers.all().find((item) => item.name === serverId);
  const serverUrl = row?.url || (serverId === 'neon' ? 'https://mcp.neon.tech/mcp' : null);
  if (!serverUrl || !/^https?:\/\//.test(serverUrl)) throw new Error('Configure an HTTP MCP server before signing in');
  const provider = createAuthProvider(serverUrl, database, true);
  const state = provider.state();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(state);
      reject(new Error('OAuth timeout'));
    }, 600_000);
    pending.set(state, { provider, serverUrl, resolve, reject, timer });
    auth(provider, { serverUrl }).then((result) => {
      if (result === 'AUTHORIZED') {
        clearTimeout(timer); pending.delete(state);
        resolve({ connected: true });
      }
    }).catch((error) => { clearTimeout(timer); pending.delete(state); reject(error); });
  });
}
function handleOAuthCallback(value) {
  let url;
  try { url = new URL(value); } catch { return false; }
  if (`${url.protocol}//${url.host}${url.pathname}` !== REDIRECT_BASE) return false;
  const state = url.searchParams.get('state');
  const entry = pending.get(state);
  if (!entry) return false;
  pending.delete(state); clearTimeout(entry.timer);
  const error = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  if (error || !code) { entry.reject(new Error(error || 'OAuth callback has no code')); return true; }
  auth(entry.provider, { serverUrl: entry.serverUrl, authorizationCode: code }).then((result) => {
    if (result !== 'AUTHORIZED') throw new Error('MCP authorization did not complete');
    void require('./mcp-client.cjs').closeAllMcpClients();
    entry.resolve({ connected: true });
  }).catch(entry.reject);
  return true;
}
function getSupportedProviders(database) {
  return database?.getQueries().listMcpServers.all().filter((row) => row.url).map((row) => row.name) || [];
}
module.exports = { createAuthProvider, credentialKey, startOAuthFlow, handleOAuthCallback, getSupportedProviders, REDIRECT_BASE };
