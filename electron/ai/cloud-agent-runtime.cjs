'use strict';

/**
 * Cloud runtime for a Many.
 * Desktop and Companion create with the same body: dome credits, or a saved
 * API-key provider whose base URL is reachable outside the user's machine.
 * The API key itself never leaves the main process and is never shown.
 *
 * Contract: shared/manys/cloud-runtime.json
 */

const net = require('node:net');
const contract = require('../../shared/manys/cloud-runtime.json');
const { isBlockedIp } = require('../services/web/url-guard.cjs');
const { API_KEY_CHAT_PROVIDERS } = require('./provider-auth.cjs');
const { hasProviderApiKey, readProviderBaseUrl } = require('./provider-keys.cjs');
const { readSettingSecret } = require('../core/settings-secrets.cjs');

const SOURCES = new Set(contract.sources);
const PROVIDER_ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
const RUNTIME_KEY_PREFIX = 'manys_runtime:';

/** Defaults that only exist on the user's machine until a public base URL is saved. */
const MACHINE_DEFAULT_BASE_URLS = {
  ollama: 'http://127.0.0.1:11434',
  vllm: 'http://127.0.0.1:8000/v1',
  lmstudio: 'http://127.0.0.1:1234/v1',
};

/** Providers that can authenticate with a saved API key (OAuth and Dome credits are not in this set). */
const API_KEY_CANDIDATES = [
  ...API_KEY_CHAT_PROVIDERS,
  'ollama',
  'vllm',
  'lmstudio',
];

const PROVIDER_NAMES = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google Gemini',
  minimax: 'MiniMax',
  openrouter: 'OpenRouter',
  deepseek: 'DeepSeek',
  moonshot: 'Moonshot',
  qwen: 'Qwen',
  opencode: 'OpenCode Zen',
  'opencode-go': 'OpenCode Go',
  xai: 'xAI',
  groq: 'Groq',
  mistral: 'Mistral',
  fireworks: 'Fireworks',
  together: 'Together',
  'google-vertex': 'Google Vertex',
  'azure-openai-responses': 'Azure OpenAI',
  ollama: 'Ollama',
  vllm: 'vLLM',
  lmstudio: 'LM Studio',
};

const LOCAL_SUFFIXES = [
  '.localhost',
  '.local',
  '.localdomain',
  '.home.arpa',
  '.home',
  '.lan',
  '.internal',
];

const LOCAL_NAMES = new Set([
  'localhost',
  'host.docker.internal',
  'gateway.docker.internal',
  'kubernetes.default',
  'metadata.google.internal',
]);

function normalizeHost(hostname) {
  return String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
}

function unwrapIpv6(host) {
  if (host.startsWith('[') && host.endsWith(']')) return host.slice(1, -1);
  return host;
}

function isMachineLocalHostname(hostname) {
  const host = unwrapIpv6(normalizeHost(hostname));
  if (!host) return true;
  if (LOCAL_NAMES.has(host) || LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  const mapped = host.startsWith('::ffff:') ? host.slice('::ffff:'.length) : host;
  if (net.isIP(mapped) && isBlockedIp(mapped)) return true;
  if (net.isIP(host) && isBlockedIp(host)) return true;
  if (!host.includes('.') && !host.includes(':')) return true;
  return false;
}

/**
 * Empty means "the provider's own public API".
 * Unparseable or loopback/private/link-local/single-label hosts cannot run in the cloud.
 * @param {string | undefined} url
 */
function isMachineLocalBaseUrl(url) {
  const value = String(url || '').trim();
  if (!value) return false;
  try {
    return isMachineLocalHostname(new URL(value).hostname);
  } catch {
    return true;
  }
}

function effectiveBaseUrl(queries, provider) {
  if (provider === 'ollama') {
    const saved = queries.getSetting.get('ollama_base_url')?.value;
    return String(saved || MACHINE_DEFAULT_BASE_URLS.ollama).trim();
  }
  const custom = readProviderBaseUrl(queries, provider);
  if (custom) return custom;
  return MACHINE_DEFAULT_BASE_URLS[provider] || '';
}

function hasSavedApiKey(queries, provider) {
  if (provider === 'ollama') return Boolean(readSettingSecret(queries, 'ollama_api_key'));
  return hasProviderApiKey(queries, provider);
}

function listCloudAgentProviders(queries) {
  const providers = [];
  for (const id of API_KEY_CANDIDATES) {
    const name = PROVIDER_NAMES[id];
    if (!name || !hasSavedApiKey(queries, id)) continue;
    if (isMachineLocalBaseUrl(effectiveBaseUrl(queries, id))) continue;
    providers.push({ id, name });
  }
  providers.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return providers;
}

function publicRuntime(runtime) {
  if (runtime.source === 'dome_credits') return { source: 'dome_credits' };
  return { source: 'provider_key', provider: runtime.provider };
}

function parseRuntime(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value.source;
  if (!SOURCES.has(source)) return null;
  if (source === 'dome_credits') return { source: 'dome_credits' };
  const provider = typeof value.provider === 'string' ? value.provider.trim() : '';
  if (!PROVIDER_ID.test(provider)) return null;
  return { source: 'provider_key', provider };
}

function runtimeSettingKey(id) {
  return `${RUNTIME_KEY_PREFIX}${id}`;
}

function rememberRuntime(queries, id, runtime) {
  if (!id || !runtime) return;
  queries.setSetting.run(runtimeSettingKey(id), JSON.stringify(publicRuntime(runtime)), Date.now());
}

function readRuntime(queries, id) {
  if (!id) return null;
  const raw = queries.getSetting.get(runtimeSettingKey(id))?.value;
  if (!raw) return null;
  try {
    return parseRuntime(JSON.parse(raw));
  } catch {
    return null;
  }
}

function overlayRuntime(queries, many) {
  if (!many || typeof many !== 'object' || typeof many.id !== 'string') return many;
  const fromServer = parseRuntime(many.runtime);
  if (fromServer) {
    rememberRuntime(queries, many.id, fromServer);
    return { ...many, runtime: publicRuntime(fromServer) };
  }
  const stored = readRuntime(queries, many.id);
  const rest = { ...many };
  delete rest.runtime;
  return stored ? { ...rest, runtime: publicRuntime(stored) } : rest;
}

function attachRememberedRuntime(queries, data) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data.manys)) {
    return { ...data, manys: data.manys.map((many) => overlayRuntime(queries, many)) };
  }
  if (data.many && typeof data.many === 'object') {
    return { ...data, many: overlayRuntime(queries, data.many) };
  }
  if (typeof data.id === 'string' && data.grants && typeof data.grants === 'object') {
    return overlayRuntime(queries, data);
  }
  return data;
}

function createdManyId(data) {
  if (!data || typeof data !== 'object') return '';
  if (typeof data.id === 'string') return data.id;
  if (data.many && typeof data.many.id === 'string') return data.many.id;
  return '';
}

function acceptCreatedMany(queries, sent, data) {
  const id = createdManyId(data);
  if (id && sent) rememberRuntime(queries, id, sent);
  return attachRememberedRuntime(queries, data);
}

/**
 * @param {object} queries
 * @param {Record<string, unknown> | undefined} body
 */
function prepareCloudManyCreate(queries, body) {
  const sourceBody = body && typeof body === 'object' ? body : {};
  const runtime = parseRuntime(sourceBody.runtime);
  if (!runtime) return { ok: false, error: 'invalid_runtime' };
  if (runtime.source === 'provider_key') {
    const allowed = listCloudAgentProviders(queries).some((provider) => provider.id === runtime.provider);
    if (!allowed) return { ok: false, error: 'provider_not_cloud_compatible' };
  }
  const next = { ...sourceBody, runtime: publicRuntime(runtime) };
  delete next.apiKey;
  delete next.api_key;
  return { ok: true, body: next, runtime: publicRuntime(runtime) };
}

module.exports = {
  SOURCES,
  isMachineLocalBaseUrl,
  isMachineLocalHostname,
  listCloudAgentProviders,
  parseRuntime,
  publicRuntime,
  prepareCloudManyCreate,
  rememberRuntime,
  readRuntime,
  attachRememberedRuntime,
  acceptCreatedMany,
};
