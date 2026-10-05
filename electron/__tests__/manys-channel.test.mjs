import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, Module } from 'node:module';

const require = createRequire(import.meta.url);
const authPath = require.resolve('../auth/dome-oauth.cjs');
const previousAuth = require.cache[authPath];
const authStub = new Module(authPath);
authStub.exports = { getOrRefreshSession: async () => ({}), getDomeProviderBaseUrl: () => 'https://dome-provider.test' };
require.cache[authPath] = authStub;
const channelPath = require.resolve('../ipc/agents/manys-channel.cjs');
delete require.cache[channelPath];
const { register } = require('../ipc/agents/manys-channel.cjs');

const MANY = '11111111-1111-4111-8111-111111111111';
class FakeSocket {
  static last = null;
  constructor(url, headers, behaviour) {
    Object.assign(this, { url, headers, readyState: 0, sent: [], closed: null });
    FakeSocket.last = this;
    queueMicrotask(() => {
      if (behaviour === 'fail') return this.onerror?.();
      this.readyState = 1;
      this.onopen?.();
    });
  }
  send(data) { this.sent.push(data); }
  close(code) { this.closed = code ?? 1000; this.readyState = 3; this.onclose?.({ code: this.closed }); }
}

function setup({ session = { connected: true, accessToken: 'tok-1' }, behaviour } = {}) {
  const handlers = new Map();
  register({
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    windowManager: { isAuthorized: (id) => id !== 99 },
    database: {},
    createSocket: (url, headers) => new FakeSocket(url, headers, behaviour),
    getSession: async () => session,
    providerUrl: () => 'https://dome-provider.test/',
  });
  const sent = [];
  const makeSender = (id) => {
    const destroyedListeners = [];
    return { id, isDestroyed: () => false, send: (channel, payload) => sent.push([id, channel, payload]), once: (name, fn) => destroyedListeners.push(fn), destroy: () => destroyedListeners.forEach((fn) => fn()) };
  };
  const call = (name, sender, payload) => handlers.get(name)({ sender }, payload);
  return { call, sent, makeSender };
}

test('opens a wss socket with the session token and relays the desktop to the window that opened it', async () => {
  const { call, sent, makeSender } = setup();
  const sender = makeSender(1);
  const opened = await call('manys:channel:open', sender, { manyId: MANY, channel: 'desktop' });
  assert.equal(opened.success, true);
  assert.equal(FakeSocket.last.url, `wss://dome-provider.test/api/v1/manys/${MANY}/computer/desktop`);
  assert.deepEqual(FakeSocket.last.headers, { authorization: 'Bearer tok-1' });
  assert.equal(FakeSocket.last.binaryType, 'arraybuffer');
  FakeSocket.last.onmessage({ data: new Uint8Array([1, 2, 3]).buffer });
  FakeSocket.last.onmessage({ data: '{"type":"error","error":"control_released"}' });
  FakeSocket.last.onmessage({ data: 'x'.repeat(5000) });
  assert.deepEqual(sent.map(([, , payload]) => payload.type), ['binary', 'message']);
  assert.deepEqual([...sent[0][2].bytes], [1, 2, 3]);
  const bytes = new Uint8Array([5, 0, 0, 0, 10, 0, 20]);
  assert.equal((await call('manys:channel:send', sender, { channelId: opened.data.channelId, bytes })).success, true);
  assert.deepEqual(FakeSocket.last.sent, [bytes]);
  FakeSocket.last.close(1006);
  assert.equal(sent.at(-1)[2].type, 'close');
  assert.equal(sent.at(-1)[2].code, 1006);
});

test('refuses unknown windows, other channels, malformed requests and a missing connection', async () => {
  const { call, makeSender } = setup();
  assert.equal((await call('manys:channel:open', makeSender(99), { manyId: MANY, channel: 'desktop' })).error, 'unauthorized');
  assert.equal((await call('manys:channel:open', makeSender(1), { manyId: 'nope', channel: 'desktop' })).error, 'invalid_request');
  assert.equal((await call('manys:channel:open', makeSender(1), { manyId: MANY, channel: 'terminal' })).error, 'invalid_request');
  assert.equal((await call('manys:channel:open', makeSender(1), { manyId: MANY, channel: 'desktop', extra: 1 })).error, 'invalid_request');
  const offline = setup({ session: { connected: false } });
  assert.equal((await offline.call('manys:channel:open', offline.makeSender(1), { manyId: MANY, channel: 'desktop' })).error, 'not_connected');
});

test('reports a socket that never opens', async () => {
  const { call, makeSender } = setup({ behaviour: 'fail' });
  assert.equal((await call('manys:channel:open', makeSender(1), { manyId: MANY, channel: 'desktop' })).error, 'channel_unavailable');
});

test('only the owning window can send or close, and sends are bounded', async () => {
  const { call, makeSender } = setup();
  const owner = makeSender(1);
  const { data } = await call('manys:channel:open', owner, { manyId: MANY, channel: 'desktop' });
  const socket = FakeSocket.last;
  const bytes = new Uint8Array([4, 1, 0, 0]);
  assert.equal((await call('manys:channel:send', owner, { channelId: data.channelId, bytes })).success, true);
  assert.equal((await call('manys:channel:send', makeSender(2), { channelId: data.channelId, bytes })).error, 'channel_closed');
  assert.equal((await call('manys:channel:send', owner, { channelId: data.channelId, bytes: new Uint8Array(0) })).error, 'invalid_request');
  assert.equal((await call('manys:channel:send', owner, { channelId: data.channelId, bytes: new Uint8Array(256 * 1024 + 1) })).error, 'invalid_request');
  assert.equal((await call('manys:channel:send', owner, { channelId: data.channelId, data: 'text' })).error, 'invalid_request');
  await call('manys:channel:close', makeSender(2), { channelId: data.channelId });
  assert.equal(socket.closed, null);
  await call('manys:channel:close', owner, { channelId: data.channelId });
  assert.equal(socket.closed, 1000);
  assert.equal((await call('manys:channel:send', owner, { channelId: data.channelId, bytes })).error, 'channel_closed');
});

test('limits channels per window and closes them when the window goes away', async () => {
  const { call, makeSender } = setup();
  const sender = makeSender(1);
  const sockets = [];
  for (let i = 0; i < 4; i += 1) {
    assert.equal((await call('manys:channel:open', sender, { manyId: MANY, channel: 'desktop' })).success, true);
    sockets.push(FakeSocket.last);
  }
  assert.equal((await call('manys:channel:open', sender, { manyId: MANY, channel: 'desktop' })).error, 'too_many_channels');
  sender.destroy();
  assert.deepEqual(sockets.map((socket) => socket.closed), [1001, 1001, 1001, 1001]);
});

after(() => {
  if (previousAuth) require.cache[authPath] = previousAuth;
  else delete require.cache[authPath];
});
