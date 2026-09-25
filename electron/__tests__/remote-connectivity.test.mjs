import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const settle = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };

function load(relative, stubs, extra = {}) {
  const filename = new URL(relative, import.meta.url);
  const mod = { exports: {} };
  vm.runInNewContext(readFileSync(filename, 'utf8'), {
    module: mod, exports: mod.exports,
    require: (id) => id in stubs ? stubs[id] : require(id),
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    AbortController, AbortSignal, TextDecoder, URL, URLSearchParams, ...extra,
  }, { filename: filename.pathname });
  return mod.exports;
}

function clientFixture(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const streams = [];
  const events = [];
  const requests = [];
  let publish;
  const values = new Map([['remote_many_enabled', '1'], ['remote_many_public_key', 'public']]);
  const database = { getDB: () => ({}), getQueries: () => ({
    getSetting: { get: (key) => ({ value: values.get(key) }) },
    setSetting: { run: (key, value) => values.set(key, value) },
  }) };
  const api = load('../remote/index.cjs', {
    '../ai/dome-provider-url.cjs': { getDomeProviderBaseUrl: () => 'https://relay.test' },
    '../auth/dome-oauth.cjs': { fetchWithDomeAuth: async (_, url, options) => {
      requests.push(url);
      if (url.includes('/stream')) {
        streams.push(options.signal);
        return { ok: true, body: new ReadableStream({ start(controller) {
          options.signal.addEventListener('abort', () => controller.error(options.signal.reason), { once: true });
        } }) };
      }
      if (url.endsWith('/events')) events.push(JSON.parse(options.body));
      return { ok: true, text: async () => JSON.stringify(url.endsWith('/presence') ? {
        devices: [{ id: 'phone', publicKey: 'phone-key' }],
        pairings: [{ id: 'pair', desktopDeviceId: 'desktop', companionDeviceId: 'phone', status: 'active' }],
      } : {}) };
    } },
    '../storage/device-id.cjs': { getOrCreateDeviceId: () => 'desktop' },
    '../core/settings-secrets.cjs': { readSettingSecret: () => 'private' },
    './protocol.cjs': { HEARTBEAT_MS: 15000, isEnvelope: () => true },
    './crypto.cjs': { deriveSharedKey: () => 'key', encryptEnvelope: (_, __, value) => value },
    './executor.cjs': { createExecutor: ({ publishEvent }) => { publish = publishEvent; return {}; } },
    './many-public.cjs': { buildCapabilities: async () => ({}) },
  });
  t.after(() => api.stop());
  return { api, database, streams, events, requests, publish: (event) => publish(event) };
}

test('repeated start creates one listener and stop/start cannot revive the old listener', async (t) => {
  const f = clientFixture(t);
  await f.api.start({ database: f.database });
  await f.api.start();
  await settle();
  assert.equal(f.streams.length, 1);
  assert.equal(f.requests.filter((url) => url.endsWith('/heartbeat')).length, 1);
  f.api.stop();
  await f.api.start();
  await settle();
  assert.equal(f.streams.length, 2);
  assert.equal(f.streams[0].aborted, true);
  assert.equal(f.streams[1].aborted, false);
  assert.equal(f.api.getRuntime().getStatus().connected, true);
});

test('a silent connection is aborted and reconnected', async (t) => {
  const f = clientFixture(t);
  await f.api.start({ database: f.database });
  await settle();
  t.mock.timers.tick(35000);
  await settle();
  assert.equal(f.streams[0].aborted, true);
  assert.equal(f.api.getRuntime().getStatus().connected, false);
  t.mock.timers.tick(500);
  await settle();
  assert.equal(f.streams.length, 2);
});

test('continuous token arrival cannot defer a text batch beyond 220 ms', async (t) => {
  const f = clientFixture(t);
  await f.api.start({ database: f.database });
  await settle();
  const text = (value) => f.publish({ type: 'text', runId: 'run', payload: { text: value } });
  text('a');
  t.mock.timers.tick(100);
  text('b');
  t.mock.timers.tick(100);
  text('c');
  t.mock.timers.tick(20);
  await settle();
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0].envelope.payload.text, 'abc');
});

test('pairing registers the desktop device before requesting a code', async (t) => {
  const f = clientFixture(t);
  await f.api.start({ database: f.database });
  await settle();
  f.requests.length = 0;
  await f.api.getRuntime().startPairing();
  const devicesAt = f.requests.findIndex((url) => url.endsWith('/api/v1/remote/devices'));
  const pairingAt = f.requests.findIndex((url) => url.endsWith('/api/v1/remote/pairing'));
  assert.ok(devicesAt >= 0, 'device registration request sent');
  assert.ok(devicesAt < pairingAt, 'registration precedes pairing');
});

function oauthFixture(fetch) {
  let row = { user_id: 'user', access_token: 'old', refresh_token: 'refresh-old', expires_at: Date.now() + 60000 };
  const queries = {
    getDomeProviderSessionWithRefresh: { get: () => row },
    upsertDomeProviderSession: { run: (user, access, refresh, expires) => {
      row = { user_id: user, access_token: access, refresh_token: refresh, expires_at: expires };
    } },
    clearDomeProviderSessions: { run: () => { row = null; } },
  };
  const api = load('../auth/dome-oauth.cjs', {
    electron: { shell: {} },
    '../ai/dome-provider-url.cjs': { getDomeProviderBaseUrl: () => 'https://relay.test' },
    '../core/settings-secrets.cjs': { encryptSessionField: (s) => s, decryptSessionField: (s) => s },
  }, { fetch });
  return { api, database: { getQueries: () => queries }, queries, expireLater: () => { row.expires_at = Date.now() + 3600000; } };
}

test('concurrent proactive refreshes rotate the single-use token only once', async () => {
  let rotations = 0;
  const f = oauthFixture(async () => {
    rotations++;
    await settle();
    return Response.json({ access_token: 'new', refresh_token: 'refresh-new', expires_in: 3600 });
  });
  const sessions = await Promise.all(Array.from({ length: 10 }, () => f.api.getOrRefreshSession(f.database)));
  assert.equal(rotations, 1);
  assert.ok(sessions.every((s) => s.accessToken === 'new'));
});

test('simultaneous and delayed 401s reuse the replacement token', async () => {
  let rotations = 0;
  let release;
  const delayed = new Promise((resolve) => { release = resolve; });
  const f = oauthFixture(async (url, options) => {
    if (url.endsWith('/token')) {
      rotations++;
      await settle();
      return Response.json({ access_token: 'new', refresh_token: 'refresh-new', expires_in: 3600 });
    }
    if (options.headers.Authorization === 'Bearer old') {
      if (url.endsWith('/late')) await delayed;
      return new Response('', { status: 401 });
    }
    return new Response('ok');
  });
  f.expireLater();
  const late = f.api.fetchWithDomeAuth(f.database, 'https://relay.test/late');
  const responses = await Promise.all(Array.from({ length: 5 }, () => f.api.fetchWithDomeAuth(f.database, 'https://relay.test/now')));
  release();
  assert.equal((await late).status, 200);
  assert.ok(responses.every((r) => r.status === 200));
  assert.equal(rotations, 1);
});

test('a refresh completing after logout does not recreate the session', async () => {
  let release;
  const f = oauthFixture(() => new Promise((resolve) => { release = resolve; }));
  const refresh = f.api.getOrRefreshSession(f.database);
  f.queries.clearDomeProviderSessions.run();
  release(Response.json({ access_token: 'new', expires_in: 3600 }));
  assert.equal((await refresh).connected, false);
  assert.equal(f.queries.getDomeProviderSessionWithRefresh.get(), null);
});
