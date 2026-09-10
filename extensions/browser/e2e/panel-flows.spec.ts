import { chromium, expect, test } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
let context: BrowserContext;
let page: Page;
let sourcePage: Page;
let worker: Worker;
let extensionPath: string;

// Exercise the compiled sidebar and isolated page reader. The
// bridge is stubbed inside this test's worker; no user's Desktop data is touched.
test.beforeEach(async () => {
  extensionPath = mkdtempSync(path.join(tmpdir(), 'dome-extension-test-'));
  cpSync(path.resolve(root, '../.output/chrome-mv3'), extensionPath, {
    recursive: true,
  });
  const manifest = JSON.parse(
    readFileSync(path.join(extensionPath, 'manifest.json'), 'utf8'),
  );
  manifest.host_permissions.push('https://dome-fixture.test/*');
  writeFileSync(
    path.join(extensionPath, 'manifest.json'),
    JSON.stringify(manifest),
  );
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    locale: 'es-ES',
    viewport: { width: 408, height: 1000 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent('serviceworker'));
  await worker.evaluate(async () => {
    const chrome = (globalThis as any).chrome;
    await chrome.storage.local.set({
      'dome.session': {
        token: 'dxt_test',
        projectId: 'default',
        noteId: 'n1',
        clientName: 'Test',
      },
      'dome.appearance': 'light',
    });
    const state = ((globalThis as any).__test = {
      note: {
        id: 'n1',
        title: 'Research notes',
        projectId: 'default',
        markdown: '# Research\n\nOriginal note.\n',
        updatedAt: 10,
      },
      requests: [] as any[],
      conflict: false,
      streamDelay: 0,
      agentMode: '' as string,
      agentController: null as ReadableStreamDefaultController | null,
    });
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
      state.requests.push({ url, method: init?.method || 'GET', body });
      const ok = (data: unknown) =>
        new Response(JSON.stringify({ success: true, data }));
      if (url.endsWith('/context'))
        return ok({
          projectId: 'default',
          projects: [
            { id: 'default', name: 'Dome' },
            { id: 'p2', name: 'Reading' },
          ],
        });
      if (url.includes('/notes?')) return ok({ notes: [state.note] });
      if (url.endsWith('/notes/n1') && init?.method === 'PUT') {
        if (state.conflict)
          return new Response(
            JSON.stringify({
              success: false,
              conflict: true,
              note: {
                ...state.note,
                markdown: 'Changed in Desktop',
                updatedAt: 20,
              },
              error: 'Conflict',
            }),
            { status: 409 },
          );
        state.note = {
          ...state.note,
          ...body,
          updatedAt: state.note.updatedAt + 1,
        };
        return ok(state.note);
      }
      if (url.endsWith('/notes/n1')) return ok(state.note);
      if (url.endsWith('/notes'))
        return ok({ ...state.note, ...body, id: 'n2', updatedAt: 21 });
      if (url.endsWith('/capture-url'))
        return ok({ id: 'u1', domeLink: 'dome://resource/u1/url' });
      if (url.endsWith('/contact'))
        return ok({ person: { id: 'c1', displayName: body.displayName } });
      if (url.endsWith('/ai/sessions')) return ok({ sessions: [{ id: 'desktop-session', title: 'Desktop conversation' }] });
      if (url.endsWith('/ai/sessions/desktop-session')) return ok({ id: 'desktop-session', messages: [{ role: 'user', text: 'Earlier question' }, { role: 'assistant', text: 'Earlier answer' }] });
      if (url.endsWith('/ai/tool-result') && state.agentController) {
        const emit = (event: unknown) => state.agentController!.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
        if (body.callId === '00000000-0000-4000-8000-000000000001') {
          const data = body.result.data;
          const input = data.elements.find((element: any) => element.label === 'Search fixture');
          emit({ type: 'browser_tool', streamId: 'agent-test', callId: '00000000-0000-4000-8000-000000000002', name: state.agentMode === 'fill' ? 'browser_fill' : 'dome_create_note', args: state.agentMode === 'fill' ? { snapshotId: data.snapshotId, elementId: input.id, value: 'Ada Lovelace' } : { title: 'Agent note', markdown: '# Saved by Many\n\nSource: ' + data.url } });
        } else {
          emit({ type: 'delta', text: body.result.success ? 'Action completed.' : 'Action declined.' });
          emit({ type: 'done' }); state.agentController.close(); state.agentController = null;
        }
        return ok({ accepted: true });
      }
      if (url.endsWith('/ai/stream')) {
        if (state.agentMode) return new Response(new ReadableStream({ start(controller) {
          state.agentController = controller;
          controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify({ type: 'browser_tool', streamId: 'agent-test', callId: '00000000-0000-4000-8000-000000000001', name: 'browser_read_page', args: {} }) + '\n\n'));
        } }), { headers: { 'Content-Type': 'text/event-stream' } });
        if (state.streamDelay)
          await new Promise((resolve) =>
            setTimeout(resolve, state.streamDelay),
          );
        return new Response(
          'data: {"type":"delta","text":"## Key ideas\\n\\n- A useful insight."}\n\ndata: {"type":"done"}\n\n',
          { headers: { 'Content-Type': 'text/event-stream' } },
        );
      }
      return ok({ cancelled: true });
    };
  });
  await context.route('https://dome-fixture.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html><head><title>Scenarios for our economic future</title><style>html{font-size:30px}body{font:30px Georgia,serif;color:maroon;background:#f7f5f0}button{font-size:40px}</style></head><body><article><h1>Scenarios for our economic future</h1><p>The economics team models how technology affects work and growth.</p><input aria-label="Search fixture"/><button type="button">Continue</button></article></body></html>',
    }),
  );
  sourcePage = await context.newPage();
  await sourcePage.goto('https://dome-fixture.test/article');
  await worker.evaluate(async () => {
    const chrome = (globalThis as any).chrome;
    const tabs = await chrome.tabs.query({
      url: 'https://dome-fixture.test/*',
    });
    await chrome.storage.local.set({ 'dome.sourceTab': tabs[0].id });
    await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      files: ['content-scripts/panel.js'],
    });
  });
  await expect(sourcePage.locator('.dome-panel, dome-capture-panel')).toHaveCount(0);
  page = await context.newPage();
  await page.goto(`chrome-extension://${new URL(worker.url()).host}/sidebar.html`);
  await expect(page.locator('.connection-dot.connected')).toBeVisible();
  await expect(page.locator('.context-line')).toContainText('Scenarios for our economic future');
});

test.afterEach(async () => {
  await context?.close();
  if (extensionPath) rmSync(extensionPath, { recursive: true, force: true });
});

test('isolates Desktop styling, captures pages and embeds Many in the three tasks', async () => {
  await expect(page.getByRole('tab')).toHaveCount(4);
  await expect(page.locator('.many-welcome')).toBeVisible();
  await page.getByRole('tab', { name: /Capturar|Capture/ }).click();
  const panel = page.locator('.dome-panel');
  const style = await panel.evaluate((element) => ({
    font: getComputedStyle(element).fontFamily,
    size: getComputedStyle(element).fontSize,
    width: element.getBoundingClientRect().width,
    bg: getComputedStyle(element).backgroundColor,
    overflow: element.scrollWidth > element.clientWidth,
  }));
  expect(style.font).not.toContain('Georgia');
  expect(style.size).toBe('13px');
  expect(style.width).toBeLessThan(420);
  expect(style.bg).not.toBe('rgba(0, 0, 0, 0)');
  expect(style.overflow).toBe(false);
  await page
    .getByRole('button', { name: /Guardar en Dome|Save to Dome/ })
    .click();
  await expect(
    page.getByRole('link', { name: /Abrir en Dome|Open in Dome/ }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: /Resumir página|Summarize page/ })
    .click();
  await expect(page.locator('.rendered-markdown h2')).toHaveText('Key ideas');
  await panel.screenshot({ path: '/tmp/dome-extension-capture.png' });
  await page
    .getByRole('button', { name: /Añadir a la nota|Add to note/, exact: true })
    .click();
  await expect(page.locator('#dome-pane-note .ProseMirror')).toContainText(
    'A useful insight.',
  );
  await expect(page.locator('#dome-pane-note .ProseMirror')).toContainText(
    'Original note.',
  );
  await panel.screenshot({ path: '/tmp/dome-extension-notes.png' });
});

test('preserves edited notes, quotes, conflicts and hidden panel drafts', async () => {
  await page.getByRole('tab', { name: /Notas|Notes/ }).click();
  const editor = page.locator('#dome-pane-note .ProseMirror');
  await expect(editor).toBeVisible();
  await editor.fill('My unsaved draft.');
  await worker.evaluate(async () => {
    const chrome = (globalThis as any).chrome;
    const tabs = await chrome.tabs.query({
      url: 'https://dome-fixture.test/*',
    });
    await chrome.storage.local.set({ 'dome.pendingQuote': { text: 'A cited passage', url: tabs[0].url, title: tabs[0].title, id: 'quote1' } });
  });
  await expect(editor).toContainText('My unsaved draft.');
  await expect(editor).toContainText('A cited passage');
  await page.reload();
  await expect(page.locator('.connection-dot.connected')).toBeVisible();
  await worker.evaluate(() => { (globalThis as any).__test.conflict = true; });
  await expect(editor).toContainText('My unsaved draft.');
  await page
    .getByRole('button', { name: /Guardar nota|Save note/, exact: true })
    .click();
  await expect(page.locator('.conflict')).toBeVisible();
  await expect(editor).toContainText('My unsaved draft.');
  await page.getByRole('tab', { name: /Capturar|Capture/ }).click();
  await expect(page.locator('.conflict')).toBeHidden();
  await page.getByRole('tab', { name: /Notas|Notes/ }).click();
  await page
    .getByRole('button', { name: /Guardar una copia|Save a copy/ })
    .click();
  await expect(page.locator('.conflict')).toHaveCount(0);
  const created = await worker.evaluate(() =>
    (globalThis as any).__test.requests.find(
      (request: any) =>
        request.url.endsWith('/notes') && request.method === 'POST',
    ),
  );
  expect(created.body.markdown).toContain('My unsaved draft.');
  expect(created.body.markdown).toContain('A cited passage');
});

test('offers labeled manual contact entry, validates and applies Many to contact context', async () => {
  await page.getByRole('tab', { name: /Contactos|Contacts/ }).click();
  await expect(
    page.getByText(/No se ha detectado una persona|No person detected/),
  ).toBeVisible();
  const save = page.getByRole('button', {
    name: /Guardar contacto|Save contact/,
  });
  await expect(save).toBeDisabled();
  await page.getByLabel(/Nombre completo|Full name/).fill('Ada Lovelace');
  await page
    .getByLabel(/Cargo o descripción|Role or description/)
    .fill('Mathematician');
  await page
    .getByLabel(/Correo electrónico|Email/, { exact: true })
    .fill('ada@example.test');
  await page
    .getByRole('button', { name: /Resumir perfil|Summarize profile/ })
    .click();
  await page
    .getByRole('button', {
      name: /Añadir al contexto del contacto|Add to contact notes/,
    })
    .click();
  await expect(
    page.getByLabel(/Contexto y notas|Context and notes/),
  ).toHaveValue(/A useful insight/);
  await save.click();
  const saved = await worker.evaluate(() =>
    (globalThis as any).__test.requests.find((request: any) =>
      request.url.endsWith('/contact'),
    ),
  );
  expect(saved.body.displayName).toBe('Ada Lovelace');
  expect(saved.body.primaryEmail).toBe('ada@example.test');
  await page
    .locator('.dome-panel')
    .screenshot({ path: '/tmp/dome-extension-contacts.png' });
  await page
    .getByRole('button', { name: /Cambiar apariencia|Switch appearance/ })
    .click();
  await expect(page.locator('.dome-panel')).toHaveClass(/dark/);
  await page.setViewportSize({ width: 360, height: 740 });
  const overflows = await page
    .locator('.dome-panel')
    .evaluate((element) => element.scrollWidth > element.clientWidth);
  expect(overflows).toBe(false);
  await page
    .locator('.dome-panel')
    .screenshot({ path: '/tmp/dome-extension-dark.png' });
});

test('uses Desktop rich-text shortcuts and sends the latest draft to Many', async () => {
  await page.getByRole('tab', { name: /Notas|Notes/ }).click();
  const editor = page.locator('#dome-pane-note .ProseMirror');
  await page.getByRole('combobox', { name: /Notas|Notes/ }).click();
  await page.getByRole('option', { name: /Nueva nota|New note/ }).click();
  await expect(editor).toHaveText('');
  await editor.pressSequentially('# Heading');
  await editor.press('Enter');
  await editor.pressSequentially('Fresh text for Many.');
  await expect(editor.locator('h1')).toHaveText('Heading');
  await page
    .getByRole('button', { name: /Mejorar borrador|Improve draft/ })
    .click();
  await expect(
    page.locator('.many-assistant .rendered-markdown').last(),
  ).toContainText('A useful insight');
  const sent = await worker.evaluate(() =>
    (globalThis as any).__test.requests.find((request: any) =>
      request.url.endsWith('/ai/stream'),
    ),
  );
  expect(sent.body.text).toContain('# Heading');
  expect(sent.body.text).toContain('Fresh text for Many.');
  await page
    .getByRole('button', { name: /Guardar nota|Save note/, exact: true })
    .click();
  const saved = await worker.evaluate(() =>
    (globalThis as any).__test.requests.find(
      (request: any) =>
        request.method === 'POST' && request.url.endsWith('/notes'),
    ),
  );
  expect(saved.body.markdown).toContain('# Heading');
  expect(saved.body.markdown).toContain('Fresh text for Many.');
});

test('stops Many without appending late output and permits a new request', async () => {
  await worker.evaluate(() => {
    (globalThis as any).__test.streamDelay = 700;
  });
  await page
    .getByRole('button', { name: /Resumir página|Summarize page/ })
    .click();
  await page.getByRole('button', { name: /Detener|Stop/, exact: true }).click();
  await page.getByRole('textbox', { name: /Preguntar a Many|Ask Many/, exact: true }).fill('Key ideas please');
  await page.getByRole('button', { name: /Preguntar a Many|Ask Many/, exact: true }).click();
  await expect(page.locator('.rendered-markdown h2')).toHaveText('Key ideas');
  await expect(page.locator('.rendered-markdown li')).toHaveCount(1);
});


test('continues a Desktop conversation and uses the same thread across tasks', async () => {
  await page.getByRole('button', { name: /Historial|History/ }).click();
  await page.getByRole('combobox', { name: /Conversaciones de Many|Many conversations/ }).click();
  await page.getByRole('option', { name: 'Desktop conversation' }).click();
  await expect(page.locator('.many-transcript')).toContainText('Earlier answer');
  await page.getByRole('textbox', { name: /Preguntar a Many|Ask Many/, exact: true }).fill('Continue this');
  await page.getByRole('button', { name: /Preguntar a Many|Ask Many/, exact: true }).click();
  await expect(page.locator('.rendered-markdown h2')).toHaveText('Key ideas');
  await page.getByRole('tab', { name: /Notas|Notes/ }).click();
  await expect(page.locator('.many-transcript')).toContainText('Earlier answer');
  const request = await worker.evaluate(() => (globalThis as any).__test.requests.find((r: any) => r.url.endsWith('/ai/stream')));
  expect(request.body.threadId).toBe('desktop-session');
});

test('refreshes context after navigation and provides page tools without injecting UI', async () => {
  await page.getByText(/Herramientas de página|Page tools/, { exact: true }).click();
  await page.getByRole('textbox', { name: /Buscar texto en la página|Find text on this page/ }).fill('technology');
  await page.getByRole('button', { name: /Buscar|Find/, exact: true }).click();
  await expect(page.getByText(/Listo|Done/, { exact: true })).toBeVisible();
  await expect(sourcePage.locator('dome-capture-panel, .dome-panel')).toHaveCount(0);
  await sourcePage.goto('https://dome-fixture.test/another-page');
  await page.bringToFront();
  await page.getByRole('button', { name: /Actualizar|Refresh/, exact: true }).click();
  await page.getByRole('tab', { name: /Capturar|Capture/ }).click();
  await expect(page.locator('.source-url')).toHaveText('https://dome-fixture.test/another-page');
});


test('opens Many first and executes read and create-note tools inside the conversation', async () => {
  await expect(page.getByRole('tab', { name: 'Many', exact: true })).toHaveAttribute('aria-selected', 'true');
  await worker.evaluate(() => { (globalThis as any).__test.agentMode = 'note'; });
  await page.getByRole('textbox', { name: /Preguntar a Many|Ask Many/, exact: true }).fill('Read this page and create a note');
  await page.getByRole('button', { name: /Preguntar a Many|Ask Many/, exact: true }).click();
  await expect(page.locator('.many-transcript')).toContainText('Action completed.');
  await expect(page.locator('.agent-steps')).toContainText(/Crear nota|Create note/);
  const request = await worker.evaluate(() => (globalThis as any).__test.requests.find((r: any) => r.url.endsWith('/notes') && r.method === 'POST'));
  expect(request.body.title).toBe('Agent note');
  expect(request.body.markdown).toContain('https://dome-fixture.test/article');
  await page.locator('.dome-panel').screenshot({ path: '/tmp/dome-extension-agent.png' });
});

test('previews a form action and fills the exact inspected element after confirmation', async () => {
  await worker.evaluate(() => { (globalThis as any).__test.agentMode = 'fill'; });
  await page.getByRole('textbox', { name: /Preguntar a Many|Ask Many/, exact: true }).fill('Fill the search field with Ada Lovelace');
  await page.getByRole('button', { name: /Preguntar a Many|Ask Many/, exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Search fixture');
  await expect(sourcePage.getByRole('textbox', { name: 'Search fixture' })).toHaveValue('');
  await page.getByRole('button', { name: /Ejecutar acción|Execute action/, exact: true }).click();
  await expect(sourcePage.getByRole('textbox', { name: 'Search fixture' })).toHaveValue('Ada Lovelace');
  await expect(page.locator('.many-transcript')).toContainText('Action completed.');
});
