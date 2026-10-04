import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, Module } from 'node:module';

const require = createRequire(import.meta.url);
const authPath = require.resolve('../auth/dome-oauth.cjs');
const previousAuth = require.cache[authPath];
const authStub = new Module(authPath);
authStub.exports = { fetchWithDomeAuth: async () => { throw new Error('unused'); }, getDomeProviderBaseUrl: () => 'https://dome-provider.test' };
require.cache[authPath] = authStub;
const modulePath = require.resolve('../ipc/agents/manys-events.cjs');
delete require.cache[modulePath];
const { register, createSseParser } = require('../ipc/agents/manys-events.cjs');

const row = (sequence, extra = {}) => ({ sequence: String(sequence), user_id: 'secret-user', kind: 'run_text', task_id: 't1', many_id: 'm1', data: { text: `e${sequence}` }, created_at: 'x', ...extra });
const sse = (...rows) => rows.map((r) => `id: ${r.sequence}\ndata: ${JSON.stringify(r)}\n\n`).join('') + ': heartbeat\n\n';
const streamOf = (...chunks) => new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); } });
const waitFor = async (check) => { for (let i = 0; i < 200; i += 1) { if (check()) return; await new Promise((r) => setTimeout(r, 5)); } assert.fail('condition not met'); };

function setup(responses) {
  const handlers = new Map();
  const urls = [];
  const sleeps = [];
  let calls = 0;
  const fetchAuth = async (_db, url, options) => {
    urls.push(url);
    const next = responses[Math.min(calls, responses.length - 1)];
    calls += 1;
    if (next instanceof Error) throw next;
    if (calls > responses.length) await new Promise((resolve) => options.signal.addEventListener('abort', resolve, { once: true }));
    return next;
  };
  register({
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    windowManager: { isAuthorized: (id) => id !== 99 },
    database: {},
    fetchAuth,
    sleep: async (ms) => { sleeps.push(ms); },
  });
  const sent = [];
  const destroyed = [];
  const sender = { id: 1, isDestroyed: () => false, send: (channel, payload) => sent.push([channel, payload]), once: (name, fn) => destroyed.push(fn) };
  return { call: (name, who = sender, payload) => handlers.get(name)({ sender: who }, payload), sent, urls, sleeps, sender, destroyed };
}
const ok = (body) => ({ ok: true, status: 200, body });

test('the parser reads events across chunk boundaries and skips comments and garbage', () => {
  const seen = [];
  const parse = createSseParser((event) => seen.push(event));
  const text = `: hi\n\ndata: {"a":1}\n\ndata: nope\n\nid: 3\ndata: {"b":`;
  parse(text.slice(0, 20));
  parse(text.slice(20));
  parse('2}\n\n');
  assert.deepEqual(seen, [{ a: 1 }, { b: 2 }]);
});

test('starts from now, forwards only the public fields, and resumes from the last event', async () => {
  const { call, sent, urls } = setup([ok(streamOf(sse(row(5), row(6)))), ok(streamOf(sse(row(6), row(7))))]);
  assert.deepEqual(await call('manys:events:subscribe'), { success: true });
  await waitFor(() => sent.length >= 3);
  assert.equal(urls[0], 'https://dome-provider.test/api/v1/manys/events?after=latest');
  assert.equal(urls[1], 'https://dome-provider.test/api/v1/manys/events?after=6');
  assert.deepEqual(sent.map(([channel, event]) => [channel, event.sequence]), [['manys:events:event', 5], ['manys:events:event', 6], ['manys:events:event', 7]]);
  assert.deepEqual(Object.keys(sent[0][1]).sort(), ['data', 'kind', 'many_id', 'sequence', 'task_id']);
  await call('manys:events:unsubscribe');
});

test('backs off after a failure and then recovers', async () => {
  const { call, sent, sleeps } = setup([new Error('offline'), { ok: false, status: 503, body: null }, ok(streamOf(sse(row(1))))]);
  await call('manys:events:subscribe');
  await waitFor(() => sent.length >= 1);
  assert.deepEqual(sleeps.slice(0, 2), [1000, 2000]);
  await call('manys:events:unsubscribe');
});

test('one feed per window, refused for unknown windows, and stopped with the window', async () => {
  const { call, sender, destroyed, urls } = setup([ok(streamOf(sse(row(1))))]);
  assert.equal((await call('manys:events:subscribe', { id: 99 })).error, 'unauthorized');
  assert.equal((await call('manys:events:subscribe', sender, { surprise: true })).error, 'invalid_request');
  await call('manys:events:subscribe');
  await call('manys:events:subscribe');
  await waitFor(() => urls.length >= 2);
  const before = urls.length;
  destroyed.forEach((fn) => fn());
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(urls.length <= before + 1);
  assert.equal(destroyed.length, 1);
  assert.equal((await call('manys:events:unsubscribe', sender)).success, true);
});

after(() => {
  if (previousAuth) require.cache[authPath] = previousAuth;
  else delete require.cache[authPath];
});
