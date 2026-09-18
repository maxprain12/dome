'use strict';

const os = require('node:os');
const { getDomeProviderBaseUrl } = require('../ai/dome-provider-url.cjs');
const { fetchWithDomeAuth } = require('../auth/dome-oauth.cjs');
const { getOrCreateDeviceId } = require('../storage/device-id.cjs');
const { readSettingSecret, writeSettingSecret } = require('../core/settings-secrets.cjs');
const { HEARTBEAT_MS, isEnvelope } = require('./protocol.cjs');
const { generateKeyPair, deriveSharedKey, encryptEnvelope, decryptEnvelope } = require('./crypto.cjs');
const { createExecutor } = require('./executor.cjs');
const { buildCapabilities } = require('./many-public.cjs');

const ENABLED_KEY = 'remote_many_enabled';
const PUBLIC_KEY_SETTING = 'remote_many_public_key';
const PRIVATE_KEY_SETTING = 'remote_many_private_key';
const DEVICE_NAME_SETTING = 'remote_many_display_name';
const CURSOR_SETTING = 'remote_many_command_cursor';

let runtime = null;

function queriesOf(database) {
  return database.getQueries();
}

function setting(database, key, fallback = '') {
  const row = queriesOf(database).getSetting.get(key);
  return row?.value == null ? fallback : String(row.value);
}

function sameId(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function setSetting(database, key, value) {
  queriesOf(database).setSetting.run(key, String(value ?? ''), Date.now());
}

function isEnabled(database) {
  return setting(database, ENABLED_KEY) === '1';
}

function findMapValue(map, id) {
  if (map.has(id)) return map.get(id);
  for (const [key, value] of map.entries()) {
    if (sameId(key, id)) return value;
  }
  return undefined;
}

function displayName(database) {
  const stored = setting(database, DEVICE_NAME_SETTING).trim();
  if (stored) return stored.slice(0, 80);
  return `Dome · ${os.hostname() || 'Mac'}`.slice(0, 80);
}

function ensureKeys(database) {
  let publicKey = setting(database, PUBLIC_KEY_SETTING);
  let privateKey = readSettingSecret(queriesOf(database), PRIVATE_KEY_SETTING);
  if (!publicKey || !privateKey) {
    const pair = generateKeyPair();
    publicKey = pair.publicKey;
    privateKey = pair.privateKey;
    setSetting(database, PUBLIC_KEY_SETTING, publicKey);
    writeSettingSecret(queriesOf(database), PRIVATE_KEY_SETTING, privateKey);
  }
  return { publicKey, privateKey };
}

function providerUrl(path, query) {
  const base = getDomeProviderBaseUrl().replace(/\/$/, '');
  const url = new URL(`${base}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function api(database, path, options = {}) {
  const response = await fetchWithDomeAuth(database, providerUrl(path, options.query), {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal || (options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(json?.error || `remote_http_${response.status}`);
    error.status = response.status;
    error.body = json;
    throw error;
  }
  return json;
}

function parseSseBuffer(buffer, onEvent) {
  const parts = buffer.split('\n\n');
  const rest = parts.pop() || '';
  for (const block of parts) {
    const dataLines = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim());
    if (dataLines.length === 0) continue;
    try {
      onEvent(JSON.parse(dataLines.join('\n')));
    } catch {
      /* ignore malformed frames */
    }
  }
  return rest;
}

function createClient({ database, windowManager }) {
  const deviceId = String(getOrCreateDeviceId(database.getDB()) || '').trim();
  const keys = ensureKeys(database);
  const executor = createExecutor({
    database,
    publishEvent: (event) => {
      enqueuePublish(event);
    },
  });

  let stopped = false;
  let abort = null;
  let heartbeatTimer = null;
  let reconnectTimer = null;
  let commandCursor = Number(setting(database, CURSOR_SETTING, '0')) || 0;
  const pairKeys = new Map();
  let lastError = null;
  let connected = false;
  let pairing = null;

  function broadcast() {
    windowManager?.broadcast?.('remote-many:status', getStatus());
  }

  function getStatus() {
    return {
      enabled: isEnabled(database),
      connected,
      deviceId,
      displayName: displayName(database),
      publicKey: keys.publicKey,
      pairing,
      lastError,
      cursor: commandCursor,
    };
  }

  async function refreshPairKeys() {
    const presence = await api(database, '/api/v1/remote/presence');
    pairKeys.clear();
    const devices = new Map((presence.devices || []).map((row) => [row.id, row]));
    for (const row of presence.pairings || []) {
      if (row.status !== 'active' || !sameId(row.desktopDeviceId, deviceId)) continue;
      const companion = findMapValue(devices, row.companionDeviceId);
      if (!companion?.publicKey) continue;
      pairKeys.set(row.id, {
        pairingId: row.id,
        companionDeviceId: row.companionDeviceId,
        companionPublicKey: companion.publicKey,
        aesKey: deriveSharedKey(keys.privateKey, companion.publicKey, row.id),
      });
    }
    return presence;
  }

  async function register() {
    await api(database, '/api/v1/remote/devices', {
      method: 'POST',
      body: {
        id: deviceId,
        displayName: displayName(database),
        publicKey: keys.publicKey,
        capabilities: await buildCapabilities(database),
      },
    });
  }

  async function heartbeat() {
    await api(database, '/api/v1/remote/heartbeat', {
      method: 'POST',
      body: {
        deviceId,
        capabilities: await buildCapabilities(database),
      },
    });
    await refreshPairKeys();
  }

  const textBuf = new Map();
  let publishTail = Promise.resolve();
  let lastPublishWarn = 0;

  function warnPublish(err) {
    const now = Date.now();
    if (now - lastPublishWarn < 8000) return;
    lastPublishWarn = now;
    console.warn('[RemoteMany] publish event failed:', err?.message);
  }

  function queuePublish(event) {
    publishTail = publishTail
      .then(() => publishEncryptedEvent(event))
      .catch(warnPublish);
  }

  function flushTextBuffer(key) {
    const current = textBuf.get(key);
    if (!current) return;
    textBuf.delete(key);
    if (current.timer) clearTimeout(current.timer);
    if (!current.text) return;
    queuePublish({
      ...current.event,
      payload: { ...(current.event.payload || {}), text: current.text },
    });
  }

  function enqueuePublish(event) {
    if (!event?.type) return;
    if (event.type === 'thinking' || event.type === 'tool_progress' || event.type === 'phase') return;
    if (event.type === 'text') {
      const key = event.runId || event.threadId || 'text';
      const current = textBuf.get(key) || { text: '', event, timer: null };
      current.text += event.payload?.text || '';
      current.event = event;
      if (current.timer) clearTimeout(current.timer);
      current.timer = setTimeout(() => flushTextBuffer(key), 220);
      textBuf.set(key, current);
      if (current.text.length >= 500) flushTextBuffer(key);
      return;
    }
    flushTextBuffer(event.runId || event.threadId || 'text');
    queuePublish(event);
  }

  async function publishEncryptedEvent(event) {
    if (!event?.pairingId) {
      for (const peer of pairKeys.values()) {
        await publishEncryptedEvent({ ...event, pairingId: peer.pairingId, targetDeviceId: peer.companionDeviceId });
      }
      return;
    }
    const peer = findMapValue(pairKeys, event.pairingId);
    if (!peer) {
      console.warn('[RemoteMany] drop event, no peer for', event.type, event.pairingId);
      return;
    }
    const eventId = event.id || `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const envelope = encryptEnvelope(peer.aesKey, peer.pairingId, {
      id: eventId,
      type: event.type,
      threadId: event.threadId || null,
      runId: event.runId || null,
      payload: event.payload || {},
      createdAt: Date.now(),
    });
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await api(database, '/api/v1/remote/events', {
          method: 'POST',
          timeoutMs: 20_000,
          body: {
            pairingId: peer.pairingId,
            sourceDeviceId: deviceId,
            targetDeviceId: event.targetDeviceId || peer.companionDeviceId,
            eventId,
            envelope,
          },
        });
        return;
      } catch (err) {
        lastErr = err;
        const status = Number(err?.status);
        if (status !== 524 && status !== 429 && status !== 503 && err?.name !== 'TimeoutError') {
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
      }
    }
    throw lastErr || new Error('publish_failed');
  }

  async function handleFrame(frame) {
    if (!frame || frame.type === 'hello') return;
    if (frame.type !== 'command' || !isEnvelope(frame.envelope)) return;
    commandCursor = Math.max(commandCursor, Number(frame.seq) || 0);
    setSetting(database, CURSOR_SETTING, String(commandCursor));
    const peer = findMapValue(pairKeys, frame.pairingId)
      || [...pairKeys.values()].find((row) => sameId(row.pairingId, frame.envelope.kid));
    if (!peer) {
      await refreshPairKeys();
    }
    const resolved = findMapValue(pairKeys, frame.pairingId)
      || findMapValue(pairKeys, frame.envelope.kid)
      || [...pairKeys.values()].find((row) => sameId(row.pairingId, frame.envelope?.kid));
    if (!resolved) return;
    const command = decryptEnvelope(resolved.aesKey, frame.envelope);
    const result = await executor.handleCommand(command, {
      pairingId: resolved.pairingId,
      targetDeviceId: resolved.companionDeviceId,
    });
    if (result) {
      await publishEncryptedEvent({
        ...result,
        pairingId: resolved.pairingId,
        targetDeviceId: resolved.companionDeviceId,
      });
    }
    if (frame.commandId) {
      await api(database, '/api/v1/remote/commands/ack', {
        method: 'POST',
        body: { deviceId, commandIds: [frame.commandId] },
      });
    }
  }

  async function listenCommands() {
    let delay = 2_000;
    let registered = false;
    while (!stopped && isEnabled(database)) {
      abort = new AbortController();
      try {
        if (!registered) {
          await register();
          registered = true;
        }
        await refreshPairKeys();
        const response = await fetchWithDomeAuth(
          database,
          providerUrl('/api/v1/remote/commands/stream', { deviceId, since: commandCursor }),
          { method: 'GET', headers: { Accept: 'text/event-stream' }, signal: abort.signal },
        );
        if (!response.ok || !response.body) {
          throw new Error(`command_stream_${response.status}`);
        }
        connected = true;
        lastError = null;
        delay = 2_000;
        broadcast();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          buffer = parseSseBuffer(buffer, (frame) => {
            void handleFrame(frame).catch((err) => {
              console.warn('[RemoteMany] command failed:', err?.message);
              lastError = err?.message || 'command_failed';
              broadcast();
            });
          });
        }
        connected = false;
      } catch (err) {
        connected = false;
        if (err?.status === 401) registered = false;
        if (!stopped && err?.name !== 'AbortError') {
          const message = err?.message || 'remote_disconnected';
          if (!/command_stream_|ECONNRESET|socket hang up/i.test(message)) {
            lastError = message;
          }
          broadcast();
        }
      }
      if (stopped || !isEnabled(database)) return;
      await new Promise((resolve) => {
        reconnectTimer = setTimeout(resolve, delay);
      });
      delay = Math.min(delay * 2, 30_000);
    }
  }

  function startHeartbeat() {
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (!isEnabled(database) || stopped) return;
      heartbeat().catch((err) => {
        lastError = err?.message || 'heartbeat_failed';
        broadcast();
      });
    }, HEARTBEAT_MS);
  }

  async function startPairing() {
    const started = await api(database, '/api/v1/remote/pairing', {
      method: 'POST',
      body: { desktopDeviceId: deviceId },
    });
    pairing = {
      active: true,
      code: started.code,
      pairingId: started.pairingId,
      expiresAt: started.expiresAt,
    };
    broadcast();
    return pairing;
  }

  function cancelPairing() {
    pairing = null;
    broadcast();
    return { cancelled: true };
  }

  async function revoke(deviceIdToRevoke) {
    await api(database, `/api/v1/remote/devices/${deviceIdToRevoke}`, { method: 'DELETE' });
    await refreshPairKeys();
    broadcast();
    return { revoked: true };
  }

  async function start() {
    stopped = false;
    if (!isEnabled(database)) {
      connected = false;
      broadcast();
      return getStatus();
    }
    startHeartbeat();
    void listenCommands();
    broadcast();
    return getStatus();
  }

  function stop() {
    stopped = true;
    connected = false;
    abort?.abort();
    clearInterval(heartbeatTimer);
    clearTimeout(reconnectTimer);
    broadcast();
  }

  async function setEnabled(enabled) {
    setSetting(database, ENABLED_KEY, enabled ? '1' : '0');
    if (enabled) await start();
    else stop();
    return getStatus();
  }

  async function presence() {
    try {
      return await refreshPairKeys();
    } catch (err) {
      lastError = err?.message || 'presence_failed';
      broadcast();
      throw err;
    }
  }

  return {
    start,
    stop,
    setEnabled,
    startPairing,
    cancelPairing,
    revoke,
    presence,
    getStatus,
  };
}

function start(deps = {}) {
  if (runtime) {
    return runtime.start();
  }
  const database = deps.database || require('../core/database.cjs');
  runtime = createClient({ database, windowManager: deps.windowManager });
  return runtime.start();
}

function stop() {
  runtime?.stop();
}

function getRuntime() {
  return runtime;
}

module.exports = {
  start,
  stop,
  getRuntime,
  isEnabled,
};
