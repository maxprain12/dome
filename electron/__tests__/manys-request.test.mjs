import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, Module } from 'node:module';

const require = createRequire(import.meta.url);
const authPath = require.resolve('../auth/dome-oauth.cjs');
const previousAuth = require.cache[authPath];
let nextResponse = { ok: true, status: 204, body: '' };
const authStub = new Module(authPath);
authStub.exports = {
  getDomeProviderBaseUrl: () => 'https://dome-provider.test',
  fetchWithDomeAuth: async () => ({
    ok: nextResponse.ok,
    status: nextResponse.status,
    text: async () => nextResponse.body,
  }),
};
require.cache[authPath] = authStub;
const ipcPath = require.resolve('../ipc/agents/manys.cjs');
delete require.cache[ipcPath];
const { register } = require('../ipc/agents/manys.cjs');
const handlers = new Map();
const removed = [];
register({
  ipcMain: { handle(name, fn) { handlers.set(name, fn); } },
  windowManager: { isAuthorized: () => true },
  database: {
    getQueries: () => ({}),
    getDB: () => ({ prepare: (sql) => ({ run: (key) => { removed.push([sql, key]); } }) }),
  },
});
const request = (payload) => handlers.get('manys:request')({ sender: { id: 1 } }, payload);

test('an empty successful delete clears the remembered runtime', async () => {
  for (const response of [
    { ok: true, status: 204, body: '', id: 'many-1', data: {} },
    { ok: true, status: 200, body: '', id: 'many-2', data: {} },
    { ok: true, status: 200, body: '{"ok":true}', id: 'many-3', data: { ok: true } },
  ]) {
    removed.length = 0;
    nextResponse = response;
    const result = await request({ method: 'DELETE', path: `/${response.id}` });
    assert.equal(result.success, true);
    assert.deepEqual(result.data, response.data);
    assert.deepEqual(removed, [['DELETE FROM settings WHERE key=?', `manys_runtime:${response.id}`]]);
  }
});

test('a rejected delete keeps the remembered runtime', async () => {
  removed.length = 0;
  nextResponse = { ok: false, status: 404, body: '{"error":"not_found"}' };
  const result = await request({ method: 'DELETE', path: '/many-1' });
  assert.equal(result.success, false);
  assert.equal(result.error, 'not_found');
  assert.equal(removed.length, 0);
});

test('accepts the governance paths and rejects anything else in the query', async () => {
  nextResponse = { ok: true, status: 200, body: '{"entries":[]}' };
  assert.equal((await request({ path: '/many-1/audit?before=42' })).success, true);
  assert.equal((await request({ path: '/many-1/policies/rule-1', method: 'DELETE' })).success, true);
  assert.equal((await request({ path: '/many-1/audit?before=42&x=1' })).error, 'invalid_request');
  assert.equal((await request({ path: '/many-1/audit?before=abc' })).error, 'invalid_request');
});

test('lets the owner edit memory with PUT and pause the whole team with one POST', async () => {
  nextResponse = { ok: true, status: 200, body: '{"notes":"x"}' };
  assert.equal((await request({ method: 'PUT', path: '/many-1/memory', body: { notes: 'x' } })).success, true);
  assert.equal((await request({ method: 'POST', path: '/pause-all', body: { paused: true } })).success, true);
  assert.equal((await request({ method: 'PATCH', path: '/many-1/memory', body: { notes: 'x' } })).success, true, 'the path is valid for any method; Provider decides');
});

after(() => {
  if (previousAuth) require.cache[authPath] = previousAuth;
  else delete require.cache[authPath];
});
