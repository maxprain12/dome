'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { assertDomain } = require('./options.cjs');

function stateDirectory() { return path.join(require('electron').app.getPath('userData'), 'browser-states'); }
async function exportState(browser, item, context) {
  const { isEncryptionAvailable, encryptSecret } = require('../core/secret-storage.cjs');
  if (!isEncryptionAvailable()) throw new Error('Secure browser-state storage is unavailable');
  const cookies = await item.browserSession.cookies.get({});
  const origins = [];
  for (const tab of item.tabs.values()) {
    if (!/^https?:/.test(tab.view.webContents.getURL())) continue;
    const state = await browser.evaluate(item, '({origin: location.origin, localStorage: Object.fromEntries(Object.entries(localStorage))})', context.signal, tab.id);
    if (!origins.some((entry) => entry.origin === state.origin)) origins.push(state);
  }
  const stateRef = randomUUID();
  const directory = stateDirectory();
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(directory, stateRef), encryptSecret(JSON.stringify({ owner: context.threadId, cookies, origins })), { mode: 0o600 });
  return { stateRef };
}
async function importState(browser, item, stateRef, context) {
  const { decryptSecret } = require('../core/secret-storage.cjs');
  item.hasSecrets = true;
  const state = JSON.parse(decryptSecret(await fs.readFile(path.join(stateDirectory(), stateRef), 'utf8')));
  if (state.owner !== context.threadId) throw new Error('Browser state belongs to another conversation');
  for (const cookie of state.cookies) {
    const domain = cookie.domain.replace(/^\./, '');
    const url = `${cookie.secure ? 'https' : 'http'}://${domain}${cookie.path || '/'}`;
    await browser.validateUrl(url); assertDomain(url, item.options);
    await item.browserSession.cookies.set({ ...cookie, hostOnly: undefined, session: undefined, url });
  }
  for (const origin of state.origins) {
    await browser.navigate(item, origin.origin, context.signal);
    await browser.evaluate(item, `for (const [key,value] of Object.entries(${JSON.stringify(origin.localStorage)})) localStorage.setItem(key,value)`, context.signal);
  }
  return { imported: true };
}
module.exports = { exportState, importState };
