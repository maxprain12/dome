'use strict';
const { randomUUID } = require('node:crypto');
const { z } = require('zod');
const { bounded } = require('./async.cjs');
const { BrowserOptionsSchema } = require('./options.cjs');
const { command, sendKeys } = require('./cdp.cjs');
const { scopedPath, fileAction } = require('./files.cjs');

const target = { snapshotId: z.string().uuid(), elementId: z.string().min(1).max(30) };
const base = { tabId: z.string().uuid().optional(), frameId: z.string().min(1).max(100).optional() };
const text = z.string().max(200000);
const schemas = {
  browser_open_in_dome: z.object({ url: z.string().url().max(8192) }),
  browser_configure: z.object({ options: BrowserOptionsSchema }),
  browser_sessions: z.object({}),
  browser_read_page: z.object({ ...base, includeScreenshot: z.boolean().optional() }),
  browser_screenshot: z.object(base),
  browser_navigate: z.object({ ...base, url: z.string().url() }),
  browser_go_back: z.object(base),
  browser_click: z.object({ ...base, ...target }),
  browser_fill: z.object({ ...base, ...target, value: z.string().max(10000) }),
  browser_fill_secret: z.object({ ...base, ...target, secretRef: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/) }),
  browser_select: z.object({ ...base, ...target, value: z.string().max(1000) }),
  browser_scroll: z.object({ ...base, direction: z.enum(['up', 'down', 'top', 'bottom']).default('down'), ...Object.fromEntries(Object.entries(target).map(([key, schema]) => [key, schema.optional()])) }),
  browser_find: z.object({ ...base, text: z.string().min(1).max(200) }),
  browser_wait: z.object({ ...base, text: z.string().min(1).max(200), timeoutMs: z.number().int().min(250).max(10000).default(5000) }),
  browser_tabs: z.object({}),
  browser_new_tab: z.object({ url: z.string().url() }),
  browser_switch_tab: z.object({ tabId: z.string().uuid() }),
  browser_close_tab: z.object({ tabId: z.string().uuid() }),
  browser_send_keys: z.object({ ...base, keys: z.string().min(1).max(100) }),
  browser_upload_file: z.object({ ...base, ...target, path: z.string().min(1).max(2000) }),
  browser_evaluate: z.object({ ...base, script: z.string().min(1).max(20000) }),
  browser_extract: z.object({ ...base, instructions: z.string().min(1).max(4000), schema: z.record(z.string(), z.unknown()) }),
  browser_read_file: z.object({ path: z.string().min(1).max(2000) }),
  browser_write_file: z.object({ path: z.string().min(1).max(2000), text }),
  browser_replace_file: z.object({ path: z.string().min(1).max(2000), oldText: text, text }),
  browser_export_state: z.object({}),
  browser_import_state: z.object({ stateRef: z.string().uuid() }),
  browser_downloads: z.object({}),
  browser_done: z.object({ result: z.unknown() }),
};
const descriptions = {
  browser_open_in_dome: 'Open a website in Dome with its saved local cookies for manual login or exploration. Return an Open in Dome action. The user chooses Continue with Many to share the selected page; then use browser_read_page. Never request passwords in chat.',
  browser_configure: 'Configure this isolated local browser before navigation. Chromium launch options are optional; Electron is the default.',
  browser_sessions: 'List only the browser session assigned to this run, including explicit recovery sessions.',
  browser_read_page: 'Read the controlled local tab and return current text, tables, limitations and fresh element references. Read before acting.',
  browser_screenshot: 'Capture this tab and return a fresh snapshot. Images are sent only to vision-capable models.',
  browser_navigate: 'Navigate the local browser to a public HTTP(S) URL and return a snapshot. No extension required.',
  browser_go_back: 'Go back in the controlled tab and return a fresh snapshot.',
  browser_click: 'Click an observed element from the latest snapshot and return a new snapshot.',
  browser_fill: 'Replace an observed non-sensitive input value; does not submit.',
  browser_fill_secret: 'Fill an observed password input with a preconfigured secret reference. The secret is resolved only in main and never returned.',
  browser_select: 'Select an exact observed option value in a native dropdown.',
  browser_scroll: 'Scroll the page or an observed scrollable panel and return a snapshot.',
  browser_find: 'Find literal text in the rendered page and scroll it into view.',
  browser_wait: 'Wait within timeoutMs for literal rendered text and return a new snapshot; timeout is an error.',
  browser_tabs: 'List controlled tabs with their IDs, titles and URLs.',
  browser_new_tab: 'Open a public URL in another controlled tab.',
  browser_switch_tab: 'Switch to a tab ID from browser_tabs.',
  browser_close_tab: 'Close a controlled tab. Never closes a user browser tab outside this session.',
  browser_send_keys: 'Send a key or shortcut using CDP without focusing the app, e.g. Enter, Tab, Primary+A (Command on macOS, Control elsewhere).',
  browser_upload_file: 'Upload one authorized workspace/selected file into an observed file input.',
  browser_evaluate: 'Evaluate JavaScript in an isolated page world. This can change the page; use observed page data.',
  browser_extract: 'Extract structured facts from the observed page using the configured extraction model and validate against a JSON schema.',
  browser_read_file: 'Read an authorized workspace/selected UTF-8 text file (bounded).',
  browser_write_file: 'Write an authorized workspace/selected UTF-8 text file (bounded).',
  browser_replace_file: 'Replace exactly one literal occurrence in an authorized text file; errors on zero or multiple matches.',
  browser_export_state: 'Export browser state to encrypted local storage; return a reference, never cookies or tokens to the model.',
  browser_import_state: 'Import browser state supplied by the trusted local user configuration.',
  browser_downloads: 'List completed downloads in this session authorized workspace.',
  browser_done: 'Return a structured task result validated against the configured output schema.',
};

const definitions = Object.entries(schemas).map(([name, schema]) => ({ type: 'function', function: {
  name, description: descriptions[name], parameters: z.toJSONSchema(schema.strict()),
} }));
const names = new Set(Object.keys(schemas));

async function frameContext(contents, frameId, signal) {
  if (!frameId) return undefined;
  return (await command(contents, 'Page.createIsolatedWorld', { frameId, worldName: 'dome-agent-frame' }, signal)).executionContextId;
}

async function remoteTarget(contents, attribute, token, frameId, signal) {
  const contextId = await frameContext(contents, frameId, signal);
  const { result } = await command(contents, 'Runtime.evaluate', {
    expression: `document.querySelector('[${attribute}="${token}"]')`, ...(contextId ? { contextId } : {}),
  }, signal);
  if (!result.objectId || result.subtype === 'null') throw new Error('Target frame or element changed; read the page again');
  return { objectId: result.objectId, contextId };
}

async function act(browser, item, name, args, context) {
  const signal = context.signal;
  const vision = item.options.useVision !== 'off' && context.supportsVision !== false;
  if (item.options.useVision === 'on' && context.supportsVision === false) throw new Error('This model does not accept browser images');
  const tab = browser.tab(item, args.tabId);
  const contents = tab.view.webContents;
  if (name === 'browser_navigate') return browser.navigate(item, args.url, signal, tab.id, args.frameId);
  if (name === 'browser_go_back') { if (!contents.navigationHistory.canGoBack()) throw new Error('No previous page'); await new Promise((resolve, reject) => {
    if (!contents.once) { contents.navigationHistory.goBack(); setTimeout(resolve, item.options.waitAfterLoadMs); return; }
    const timer = setTimeout(() => { contents.removeListener('did-stop-loading', done); reject(new Error('Back navigation timed out')); }, 30000);
    const done = () => { clearTimeout(timer); resolve(); };
    contents.once('did-stop-loading', done); contents.navigationHistory.goBack();
  }); }
  if (name === 'browser_new_tab') { const created = await browser.newTab(item); return browser.navigate(item, args.url, signal, created.id); }
  if (name === 'browser_switch_tab') item.activeTabId = args.tabId;
  if (name === 'browser_close_tab') {
    if (item.tabs.size === 1) throw new Error('Cannot close the last controlled tab');
    browser.unhost(tab);
    contents.close(); item.tabs.delete(tab.id);
    item.activeTabId = [...item.tabs.keys()].find(id => !context.allowedBrowserTabs || context.allowedBrowserTabs.has(id));
  }
  if (name === 'browser_tabs') return { tabs: [...item.tabs.values()].map((entry) => ({ id: entry.id, url: entry.view.webContents.getURL(), title: entry.view.webContents.getTitle() })), activeTabId: item.activeTabId };
  if (['browser_click', 'browser_fill', 'browser_select'].includes(name) || (name === 'browser_scroll' && args.elementId)) {
    const result = await browser.evaluate(item, `globalThis.__domePageAgent.act(${JSON.stringify({ kind: name.replace('browser_', ''), ...args })})`, signal, tab.id, args.frameId);
    if (!result.success) throw new Error(result.error);
  }
  if (name === 'browser_scroll' && !args.elementId) await browser.evaluate(item, `window.scrollTo({top:${args.direction === 'top' ? '0' : args.direction === 'bottom' ? 'document.body.scrollHeight' : `window.scrollY + window.innerHeight * ${args.direction === 'up' ? '-0.75' : '0.75'}`}})`, signal, tab.id, args.frameId);
  if (name === 'browser_find') {
    const found = await browser.evaluate(item, `Array.from(document.querySelectorAll('h1,h2,h3,p,li,span')).find(n=>n.textContent.includes(${JSON.stringify(args.text)}))?.scrollIntoView({block:'center'}) ?? null`, signal, tab.id, args.frameId);
    // scrollIntoView returns undefined; verify the literal separately.
    if (found === null && !(await browser.evaluate(item, `document.body.innerText.includes(${JSON.stringify(args.text)})`, signal, tab.id, args.frameId))) throw new Error('Text not observed');
  }
  if (name === 'browser_wait') {
    const waitSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(args.timeoutMs)]) : AbortSignal.timeout(args.timeoutMs);
    await bounded((async () => {
      while (!(await browser.evaluate(item, `document.body.innerText.includes(${JSON.stringify(args.text)})`, waitSignal, tab.id, args.frameId))) await bounded(new Promise((resolve) => setTimeout(resolve, 100)), waitSignal);
    })(), waitSignal, args.timeoutMs);
  }
  if (name === 'browser_send_keys') {
    if (args.frameId) await browser.evaluate(item, 'document.activeElement?.focus()', signal, tab.id, args.frameId);
    await sendKeys(contents, args.keys, signal, await frameContext(contents, args.frameId, signal));
  }
  if (name === 'browser_fill_secret') {
    const token = randomUUID();
    const targetResult = await browser.evaluate(item, `globalThis.__domePageAgent.secretTarget(${JSON.stringify(args.snapshotId)},${JSON.stringify(args.elementId)},${JSON.stringify(token)})`, signal, tab.id, args.frameId);
    if (!targetResult.success) throw new Error(targetResult.error);
    const secret = require('../core/settings-secrets.cjs').readSettingSecret(require('../core/database.cjs').getQueries(), `browser_secret_${args.secretRef}_token`);
    if (!secret) throw new Error('Secret reference is not configured');
    const remote = await remoteTarget(contents, 'data-dome-secret', token, args.frameId, signal);
    const { nodeId } = await command(contents, 'DOM.requestNode', { objectId: remote.objectId }, signal);
    await command(contents, 'DOM.focus', { nodeId }, signal);
    await sendKeys(contents, 'Primary+A', signal, remote.contextId);
    item.hasSecrets = true;
    item.secrets ||= new Set(); item.secrets.add(secret);
    await command(contents, 'Input.insertText', { text: secret }, signal);
    await command(contents, 'Runtime.releaseObject', { objectId: remote.objectId }, signal);
  }
  if (name === 'browser_upload_file') {
    const file = await scopedPath(args.path, context);
    const token = randomUUID();
    const result = await browser.evaluate(item, `globalThis.__domePageAgent.uploadTarget(${JSON.stringify(args.snapshotId)},${JSON.stringify(args.elementId)},${JSON.stringify(token)})`, signal, tab.id, args.frameId);
    if (!result.success) throw new Error(result.error);
    const remote = await remoteTarget(contents, 'data-dome-upload', token, args.frameId, signal);
    await command(contents, 'DOM.setFileInputFiles', { files: [file], objectId: remote.objectId }, signal);
    await command(contents, 'Runtime.releaseObject', { objectId: remote.objectId }, signal);
  }
  if (name === 'browser_evaluate') {
    if (item.hasSecrets) throw new Error('JavaScript evaluation is disabled after secrets have been filled');
    return { value: await browser.evaluate(item, args.script, signal, tab.id, args.frameId), snapshot: await browser.snapshot(item, signal, tab.id) };
  }
  if (name === 'browser_downloads') return { downloads: item.downloads || [] };
  if (name === 'browser_extract') return require('./extraction.cjs').extract(browser, item, args, context);
  if (name === 'browser_export_state') return require('./state.cjs').exportState(browser, item, context);
  if (name === 'browser_import_state') return require('./state.cjs').importState(browser, item, args.stateRef, context);
  return browser.snapshot(item, signal, undefined, (name === 'browser_screenshot' || args.includeScreenshot) && vision);
}

async function execute(name, raw, context = {}) {
  const args = schemas[name].strict().parse(raw || {});
  if (name.endsWith('_file') && name !== 'browser_upload_file') return fileAction(name, args, context);
  const { browser } = require('./service.cjs');
  const { workspace } = require('./workspace.cjs');
  if (name === 'browser_open_in_dome') {
    if (context.threadId && !workspace.resolve(context.threadId)) await browser.finish(`agent:${context.threadId}`);
    const { sessionId, tabId, url, title, persistent } = await workspace.open(args.url, context.signal);
    workspace.onOpened({ sessionId, conversationId: context.threadId });
    return { success: true, data: { sessionId, tabId, url, title, persistent }, needsUserAction: true };
  }
  const binding = !context.browserSessionId && workspace.resolve(context.threadId);
  const owner = context.browserSessionId || binding?.sessionId || `agent:${context.threadId || context.executionId}`;
  if (!context.threadId && !context.browserSessionId && !context.executionId) throw new Error('Browser actions require a run-bound session');
  if (name === 'browser_configure') {
    if (binding) throw new Error('The user shared a saved Dome profile. Configure a separate isolated run instead.');
    await browser.finish(owner);
    await browser.close(owner);
    const options = { ...args.options, outputDirectory: context.browserOutputDirectory };
    await browser.create(owner, context.signal, options);
    return { success: true, sessionId: owner };
  }
  if (name === 'browser_sessions') return { sessions: browser.sessions.has(owner) ? [{ id: owner }] : [] };
  if (binding && ['browser_export_state', 'browser_import_state'].includes(name)) throw new Error('State export/import is disabled for the shared user profile');
  if (binding) context = { ...context, allowedBrowserTabs: binding.allowedTabs };
  if (name === 'browser_done') {
    const result = await require('./extraction.cjs').validateOutput(args.result, context.outputSchema);
    const item = browser.sessions.get(owner);
    if (item) result.files = await require('./recording.cjs').finishRecording(item);
    return result;
  }
  const stepSignal = AbortSignal.timeout(context.stepTimeoutMs || 120000);
  context = { ...context, signal: context.signal ? AbortSignal.any([context.signal, stepSignal]) : stepSignal };
  return browser.run(owner, context.signal, async (item) => {
    if (binding) {
      if (args.tabId && !binding.allowedTabs.has(args.tabId)) throw new Error('This page has not been shared with this conversation');
      if (name === 'browser_close_tab' && [...binding.allowedTabs].filter(id => item.tabs.has(id)).length < 2) throw new Error('Cannot close the last shared page');
      item.activeTabId = args.tabId || binding.tabId;
      if (name === 'browser_tabs') return { success: true, data: { tabs: [...item.tabs.values()].filter(tab => binding.allowedTabs.has(tab.id)).map(tab => ({ id: tab.id, url: tab.view.webContents.getURL(), title: tab.view.webContents.getTitle() })), activeTabId: item.activeTabId } };
    }
    const result = await act(browser, item, name, args, context);
    if (binding && name === 'browser_new_tab') binding.allowedTabs.add(item.activeTabId);
    if (binding && ['browser_new_tab', 'browser_switch_tab', 'browser_close_tab'].includes(name)) {
      binding.tabId = [...binding.allowedTabs].find(id => id === item.activeTabId) || [...binding.allowedTabs].find(id => item.tabs.has(id));
    }
    if (item.options.waitBetweenActionsMs) await bounded(new Promise((resolve) => setTimeout(resolve, item.options.waitBetweenActionsMs)), context.signal);
    return { success: true, data: result };
  }, { ...context.browserOptions, outputDirectory: context.browserOutputDirectory });
}
module.exports = { definitions, schemas, names, execute, act };
