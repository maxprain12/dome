import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { createMediaPermissions, SETTINGS_URLS } = require('../permissions/media-permissions.cjs');

function fixture({ platform = 'darwin', statuses = {}, afterAsk = {}, afterProbe = {} } = {}) {
  const state = { microphone: 'not-determined', screen: 'not-determined', ...statuses };
  const opened = [];
  const calls = { ask: 0, probe: 0 };
  const permissions = createMediaPermissions({
    platform,
    systemPreferences: {
      getMediaAccessStatus: (kind) => state[kind],
      askForMediaAccess: async () => {
        calls.ask += 1;
        Object.assign(state, afterAsk);
        return state.microphone === 'granted';
      },
    },
    desktopCapturer: {
      getSources: async () => {
        calls.probe += 1;
        Object.assign(state, afterProbe);
        if (state.screen !== 'granted') throw new Error('Failed to get sources');
        return [];
      },
    },
    shell: { openExternal: async (url) => { opened.push(url); } },
  });
  return { permissions, opened, calls };
}

test('non-macOS platforms report everything granted without prompting', async () => {
  const f = fixture({ platform: 'linux' });
  assert.deepEqual(f.permissions.getStatus(), { managedByApp: false, microphone: 'granted', screen: 'granted' });
  assert.deepEqual(await f.permissions.request('microphone'), { status: 'granted', openedSettings: false });
  assert.equal(f.calls.ask, 0);
});

test('undetermined microphone shows the native prompt', async () => {
  const f = fixture({ afterAsk: { microphone: 'granted' } });
  assert.deepEqual(await f.permissions.request('microphone'), { status: 'granted', openedSettings: false });
  assert.equal(f.calls.ask, 1);
  assert.deepEqual(f.opened, []);
});

test('denied microphone goes straight to System Settings', async () => {
  const f = fixture({ statuses: { microphone: 'denied' } });
  const result = await f.permissions.request('microphone');
  assert.deepEqual(result, { status: 'denied', openedSettings: true });
  assert.equal(f.calls.ask, 0);
  assert.deepEqual(f.opened, [SETTINGS_URLS.microphone]);
});

test('screen recording probes capture, then opens settings when still missing', async () => {
  const f = fixture({ afterProbe: { screen: 'denied' } });
  const result = await f.permissions.request('screen');
  assert.equal(f.calls.probe, 1);
  assert.deepEqual(result, { status: 'denied', openedSettings: true });
  assert.deepEqual(f.opened, [SETTINGS_URLS.screen]);
});

test('unknown statuses normalize and invalid kinds are rejected', async () => {
  const f = fixture({ statuses: { screen: 'weird' } });
  assert.equal(f.permissions.getStatus().screen, 'unknown');
  await assert.rejects(() => f.permissions.request('camera'), /invalid_permission_kind/);
});
