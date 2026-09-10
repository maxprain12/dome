import { chromium, expect, test } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const fixtureUrl = 'https://dome-fixture.test/article';
const playwrightChromePath = chromium.executablePath();
const playwrightArmChromePath = playwrightChromePath.replace(
  'chrome-mac-x64',
  'chrome-mac-arm64',
);
const browserExecutable =
  existsSync(playwrightChromePath)
    ? playwrightChromePath
    : existsSync(playwrightArmChromePath)
      ? playwrightArmChromePath
      : undefined;

let context: BrowserContext;
let page: Page;
let sourcePage: Page;
let worker: Worker;
let extensionPath: string;

async function setStreamMode(mode: string) {
  await worker.evaluate((nextMode) => {
    (globalThis as any).__test.mode = nextMode;
  }, mode);
}

async function recordedRequests() {
  return worker.evaluate(
    () => (globalThis as any).__test.requests as Array<Record<string, any>>,
  );
}

async function expectNoHorizontalOverflow() {
  const layout = await page.locator('.dome-panel').evaluate((element) => ({
    left: element.getBoundingClientRect().left,
    right: element.getBoundingClientRect().right,
    viewportWidth: document.documentElement.clientWidth,
    overflowX: getComputedStyle(element).overflowX,
  }));
  expect(layout.left).toBe(0);
  expect(layout.right).toBe(layout.viewportWidth);
  expect(layout.overflowX).toBe('hidden');
}

test.beforeEach(async () => {
  extensionPath = mkdtempSync(path.join(tmpdir(), 'dome-extension-test-'));
  cpSync(path.resolve(root, '../.output/chrome-mv3'), extensionPath, {
    recursive: true,
  });
  const manifestPath = path.join(extensionPath, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.host_permissions.push('https://dome-fixture.test/*');
  writeFileSync(manifestPath, JSON.stringify(manifest));

  context = await chromium.launchPersistentContext('', {
    ...(browserExecutable
      ? { executablePath: browserExecutable }
      : { channel: 'chromium' as const }),
    headless: true,
    locale: 'es-ES',
    viewport: { width: 400, height: 900 },
    args: [
      '--force-color-profile=srgb',
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
        noteId: 'note-research',
        clientName: 'Test',
      },
      'dome.appearance': 'light',
    });

    const now = Date.now();
    const state = ((globalThis as any).__test = {
      mode: 'rich',
      note: {
        id: 'note-research',
        title: 'Research notes',
        projectId: 'default',
        markdown: '# Research\n\nOriginal note.\n',
        updatedAt: 10,
        revision: 'revision-10',
      },
      sessions: [
        {
          id: 'desktop-session',
          title: 'Desktop conversation',
          preview: 'Earlier answer about economic scenarios',
          createdAt: now - 3_600_000,
          updatedAt: now - 1_800_000,
          pinned: true,
        },
        {
          id: 'research-roadmap',
          title: 'Research roadmap',
          preview: 'Next sources to review',
          createdAt: now - 86_400_000,
          updatedAt: now - 86_400_000,
          pinned: false,
        },
      ],
      requests: [] as Array<Record<string, unknown>>,
      conflict: false,
      streamDelay: 0,
      streamRequestCount: 0,
      agentController: null as ReadableStreamDefaultController | null,
    });

    const ok = (data: unknown) =>
      new Response(JSON.stringify({ success: true, data }), {
        headers: { 'Content-Type': 'application/json' },
      });
    const sse = (events: unknown[]) =>
      new Response(
        events
          .map((event) => `data: ${JSON.stringify(event)}\n\n`)
          .join(''),
        { headers: { 'Content-Type': 'text/event-stream' } },
      );
    const emit = (event: unknown) => {
      state.agentController?.enqueue(
        new TextEncoder().encode(
          `data: ${JSON.stringify(event)}\n\n`,
        ),
      );
    };

    globalThis.fetch = async (input, init) => {
      const url = String(input);
      const body =
        typeof init?.body === 'string' ? JSON.parse(init.body) : {};
      const method = init?.method || 'GET';
      state.requests.push({ url, method, body });

      const config = {
        provider: 'openai',
        model: 'gpt-5.1',
        providers: ['openai', 'anthropic'],
        billingMode: 'api_key',
        contextWindow: 128000,
        configured: true,
        capabilities: {
          reasoning: true,
          thinkingLevels: ['off', 'low', 'high'],
          input: ['text', 'image'],
        },
      };
      if (url.endsWith('/context')) {
        return ok({
          projectId: 'default',
          projectName: 'Dome',
          projects: [
            { id: 'default', name: 'Dome' },
            { id: 'reading', name: 'Reading' },
          ],
        });
      }
      if (url.endsWith('/bootstrap')) {
        return ok({
          config,
          catalogs: {
            skills: [
              {
                name: 'Literature review',
                description: 'Synthesize research sources',
              },
            ],
            mcp: {
              enabled: true,
              servers: [
                {
                  id: 'server-research',
                  selectionId: 'research-mcp',
                  name: 'Research MCP',
                  type: 'stdio',
                  enabled: true,
                  tools: ['search_papers', 'read_paper'],
                  lastDiscoveryAt: now,
                  lastDiscoveryError: null,
                },
              ],
            },
          },
          capabilities: {
            protocolVersion: 2,
            sessions: ['list', 'read', 'delete', 'pin'],
            streamEvents: [
              'reasoning',
              'tool_call',
              'tool_progress',
              'tool_result',
              'usage',
              'budget',
              'compaction',
              'approval',
            ],
            attachments: {
              images: true,
              maxCount: 2,
              maxDataUrlChars: 400000,
            },
          },
          context: {
            projectId: 'default',
            projectName: 'Dome',
            projects: [{ id: 'default', name: 'Dome' }],
          },
        });
      }
      if (url.endsWith('/config')) return ok(config);
      if (url.includes('/catalogs/models')) {
        return ok({
          provider: 'openai',
          limited: false,
          models: [
            {
              id: 'gpt-5.1',
              name: 'GPT 5.1',
              contextWindow: 128000,
              reasoning: true,
              input: ['text', 'image'],
              current: true,
              recommended: true,
            },
          ],
        });
      }
      if (url.endsWith('/resources/search')) {
        return ok({
          results: [
            {
              id: 'resource-economic-outlook',
              title: 'Economic outlook',
              type: 'webpage',
              snippet: 'Technology, work, and economic growth',
              score: 0.94,
            },
          ],
        });
      }
      if (url.endsWith('/resources/hydrate')) {
        return ok({
          resources: body.ids.map((id: string) => ({
            id,
            found: true,
            resource: {
              title: 'Economic outlook',
              content: 'Hydrated research context',
            },
          })),
        });
      }
      if (url.includes('/notes?')) return ok({ notes: [state.note] });
      if (url.endsWith('/notes/note-research') && method === 'PUT') {
        if (state.conflict) {
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
        }
        state.note = {
          ...state.note,
          ...body,
          updatedAt: state.note.updatedAt + 1,
          revision: `revision-${state.note.updatedAt + 1}`,
        };
        return ok(state.note);
      }
      if (url.endsWith('/notes/note-research')) return ok(state.note);
      if (url.endsWith('/notes') && method === 'POST') {
        return ok({
          ...state.note,
          ...body,
          id: 'note-created',
          updatedAt: 21,
          revision: 'revision-21',
        });
      }
      if (url.endsWith('/capture-url')) {
        return ok({
          id: 'captured-page',
          title: body.title,
          url: body.url,
          reused: false,
          domeLink: 'dome://resource/captured-page/url',
        });
      }
      if (url.endsWith('/contact')) {
        return ok({
          person: {
            id: 'contact-ada',
            displayName: body.displayName,
          },
        });
      }
      if (url.endsWith('/ai/sessions')) {
        return ok({ sessions: state.sessions });
      }
      const pinMatch = url.match(/\/ai\/sessions\/([^/]+)\/pin$/);
      if (pinMatch && method === 'PUT') {
        const session = state.sessions.find(
          (item: any) => item.id === decodeURIComponent(pinMatch[1]),
        );
        if (session) session.pinned = body.pinned;
        return ok({ id: session?.id, pinned: body.pinned });
      }
      const sessionMatch = url.match(/\/ai\/sessions\/([^/]+)$/);
      if (sessionMatch && method === 'DELETE') {
        const id = decodeURIComponent(sessionMatch[1]);
        state.sessions = state.sessions.filter(
          (item: any) => item.id !== id,
        );
        return ok({ id, deleted: true });
      }
      if (sessionMatch) {
        const id = decodeURIComponent(sessionMatch[1]);
        const summary = state.sessions.find((item: any) => item.id === id);
        return ok({
          ...summary,
          messages: [
            {
              role: 'user',
              text: 'Earlier question',
              timestamp: now - 2000,
            },
            {
              role: 'assistant',
              text: 'Earlier answer',
              timestamp: now - 1000,
              toolCalls: [
                {
                  id: 'search-call',
                  name: 'web_search',
                  arguments: { query: 'economic scenarios' },
                },
              ],
              usage: {
                inputTokens: 800,
                outputTokens: 224,
                totalTokens: 1024,
              },
              stopReason: 'end_turn',
            },
          ],
        });
      }
      if (url.endsWith('/ai/tool-result') && state.agentController) {
        if (body.callId === 'browser-read-call') {
          const inputElement = body.result.data.elements.find(
            (element: any) => element.label === 'Search fixture',
          );
          emit({
            type: 'browser_tool',
            streamId: 'browser-stream',
            callId: 'browser-fill-call',
            name: 'browser_fill',
            args: {
              snapshotId: body.result.data.snapshotId,
              elementId: inputElement.id,
              value: 'Ada Lovelace',
            },
          });
        } else {
          emit({
            type: 'tool_result',
            toolCallId: body.callId,
            result: body.result,
            isError: body.result.success === false,
          });
          emit({
            type: 'delta',
            text: body.result.success
              ? 'Action completed.'
              : 'Action declined.',
          });
          emit({
            type: 'usage',
            usage: {
              inputTokens: 300,
              outputTokens: 20,
              totalTokens: 320,
            },
          });
          emit({ type: 'done' });
          state.agentController.close();
          state.agentController = null;
        }
        return ok({ accepted: true });
      }
      if (url.endsWith('/ai/resume')) {
        return sse([
          {
            type: 'start',
            streamId: body.streamId,
            protocolVersion: 2,
            resumed: true,
          },
          {
            type: 'delta',
            text: 'Approved action completed.',
          },
          {
            type: 'usage',
            usage: {
              inputTokens: 450,
              outputTokens: 38,
              totalTokens: 488,
            },
          },
          { type: 'done' },
        ]);
      }
      if (url.endsWith('/ai/stream')) {
        const requestMode = state.mode;
        state.streamRequestCount += 1;
        if (state.streamDelay) {
          await new Promise((resolve) =>
            setTimeout(resolve, state.streamDelay),
          );
        }
        if (requestMode === 'late-stop') {
          return sse([
            {
              type: 'start',
              streamId: body.streamId,
              protocolVersion: 2,
            },
            { type: 'delta', text: 'STALE_RESPONSE_MUST_NOT_APPEAR' },
            { type: 'done' },
          ]);
        }
        if (requestMode === 'browser-fill') {
          return new Response(
            new ReadableStream({
              start(controller) {
                state.agentController = controller;
                emit({
                  type: 'start',
                  streamId: 'browser-stream',
                  protocolVersion: 2,
                });
                emit({
                  type: 'browser_tool',
                  streamId: 'browser-stream',
                  callId: 'browser-read-call',
                  name: 'browser_read_page',
                  args: {},
                });
              },
            }),
            { headers: { 'Content-Type': 'text/event-stream' } },
          );
        }
        if (requestMode === 'browser-navigate') {
          return new Response(
            new ReadableStream({
              start(controller) {
                state.agentController = controller;
                emit({
                  type: 'start',
                  streamId: body.streamId,
                  protocolVersion: 2,
                });
                emit({
                  type: 'browser_tool',
                  streamId: body.streamId,
                  callId: 'browser-navigate-call',
                  name: 'browser_navigate',
                  args: { url: 'https://dome-fixture.test/next' },
                });
              },
            }),
            { headers: { 'Content-Type': 'text/event-stream' } },
          );
        }
        if (requestMode === 'approval') {
          return sse([
            {
              type: 'start',
              streamId: body.streamId,
              protocolVersion: 2,
            },
            {
              type: 'approval',
              threadId: body.threadId,
              actionRequests: [
                {
                  name: 'dome_create_note',
                  args: {
                    title: 'Reviewed note',
                    markdown: 'Approved content',
                  },
                  description: 'Create “Reviewed note” in Dome',
                },
              ],
              reviewConfigs: [
                {
                  actionName: 'dome_create_note',
                  allowedDecisions: [
                    'approve',
                    'approve_all',
                    'reject',
                    'edit',
                  ],
                },
              ],
            },
          ]);
        }
        return sse([
          {
            type: 'start',
            streamId: body.streamId,
            protocolVersion: 2,
          },
          {
            type: 'reasoning',
            text: 'I am checking the source and its claims.',
          },
          {
            type: 'tool_call',
            toolCall: {
              id: 'web-search-call',
              name: 'web_search',
              arguments: {
                query: 'technology work economic growth',
              },
            },
          },
          {
            type: 'tool_progress',
            toolCallId: 'web-search-call',
            toolName: 'web_search',
            partialResult: 'Found 3 sources',
          },
          {
            type: 'tool_result',
            toolCallId: 'web-search-call',
            result: {
              sources: 3,
              summary: 'Evidence reviewed',
            },
            isError: false,
          },
          {
            type: 'budget',
            breakdown: {
              systemApprox: 1000,
              toolsApprox: 500,
              historyApprox: 750,
              totalApprox: 2250,
              toolCount: 8,
              historyTurns: 2,
              systemPromptApprox: 650,
              skillsApprox: 200,
              rulesApprox: 150,
              toolsRegistryApprox: 500,
              mcpApprox: 100,
              subagentsApprox: 0,
              summarizedApprox: 0,
              conversationApprox: 650,
            },
          },
          {
            type: 'usage',
            usage: {
              inputTokens: 2048,
              outputTokens: 512,
              totalTokens: 2560,
              costUsd: 0.01,
            },
          },
          {
            type: 'compaction',
            tokensBefore: 12000,
            tokensAfter: 4200,
            summaryPreview: 'The earlier research context was summarized.',
            automatic: true,
            reason: 'context_limit',
          },
          {
            type: 'delta',
            text: '## Key ideas\n\n- A useful insight.',
          },
          { type: 'done' },
        ]);
      }
      if (url.endsWith('/ai/cancel')) return ok({ cancelled: true });
      return ok({ accepted: true });
    };
  });

  await context.route('https://dome-fixture.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: [
        '<html><head><title>Scenarios for our economic future</title>',
        '<style>html{font-size:30px}body{font:30px Georgia,serif;color:maroon;background:#f7f5f0}',
        'button{font-size:40px}</style></head><body><article>',
        '<h1>Scenarios for our economic future</h1>',
        '<p>The economics team models how technology affects work and growth.</p>',
        '<input aria-label="Search fixture"/>',
        '<button type="button">Continue</button>',
        '</article></body></html>',
      ].join(''),
    }),
  );
  sourcePage = await context.newPage();
  await sourcePage.goto(fixtureUrl);
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

  page = await context.newPage();
  await page.goto(
    `chrome-extension://${new URL(worker.url()).host}/sidebar.html`,
  );
  await expect(page.locator('.connection-dot.connected')).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Modelo' }),
  ).toContainText('GPT 5.1');
});

test.afterEach(async () => {
  await context?.close();
  if (extensionPath) {
    rmSync(extensionPath, { recursive: true, force: true });
  }
});

test('abre Many en Chat y separa navegación principal de tareas', async () => {
  const header = page.locator('header');
  await expect(header.getByText('Many', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(3);
  await expect(
    page.getByRole('tab', { name: 'Chat', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByRole('tab', { name: 'Historial', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('tab', { name: 'Contexto', exact: true }),
  ).toBeVisible();
  for (const task of ['Capturar', 'Nota', 'Contacto']) {
    const button = page.getByRole('button', { name: task, exact: true });
    await expect(button).toBeVisible();
    await expect(button).not.toHaveAttribute('role', 'tab');
  }
  await expect(page.locator('.many-welcome')).toBeVisible();
  await expectNoHorizontalOverflow();
});

test('usa composer avanzado, recursos, adjuntos y SSE rico', async () => {
  await page.getByTitle('Aptitudes').click();
  await page
    .getByRole('button', { name: /Literature review/ })
    .click();
  await page.getByTitle('Servidores MCP').click();
  await page
    .getByRole('button', { name: /Research MCP/ })
    .click();
  await page.getByTitle('Recursos').click();
  await page
    .getByPlaceholder('Buscar recursos')
    .fill('economic outlook');
  await page
    .getByRole('button', { name: /Economic outlook/ })
    .click();

  const thinking = page.getByRole('combobox', {
    name: 'Nivel de razonamiento',
  });
  await thinking.click();
  await page.getByRole('option', { name: 'Alto', exact: true }).click();

  await page.getByTitle('Capacidades').click();
  await expect(page.getByText('Herramientas web', { exact: true })).toBeVisible();
  await page.getByRole('switch', { name: 'Memoria' }).click();
  await page.keyboard.press('Escape');

  await page.locator('input[type="file"]').setInputFiles({
    name: 'research.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nUwAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.getByText('research.png', { exact: true })).toBeVisible();

  const composer = page.getByRole('textbox', {
    name: /Pregunta a Many/,
  });
  await composer.fill('Compare the selected source');
  await page
    .getByRole('button', { name: 'Preguntar a Many', exact: true })
    .click();

  await page.getByText('Razonamiento', { exact: true }).click();
  await expect(
    page.getByText('I am checking the source and its claims.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText('web search', { exact: true })).toBeVisible();
  await expect(page.getByText('Found 3 sources', { exact: true })).toBeVisible();
  await expect(page.locator('.rendered-markdown h2')).toHaveText('Key ideas');
  await expect(
    page.getByText('2560 tokens', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText('Contexto compactado', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('12000 → 4200 tokens')).toBeVisible();

  const requests = await recordedRequests();
  const stream = requests.find((request) =>
    String(request.url).endsWith('/ai/stream'),
  );
  expect(stream?.body.thinkingLevel).toBe('high');
  expect(stream?.body.mcpServerIds).toEqual(['research-mcp']);
  expect(stream?.body.pinnedResources).toEqual([
    {
      id: 'resource-economic-outlook',
      title: 'Economic outlook',
    },
  ]);
  expect(stream?.body.attachments.images[0].name).toBe('research.png');
  expect(stream?.body.memoryEnabled).toBe(false);
  expect(stream?.body.browserTools).toBe(true);
  expect(stream?.body.text).toContain(
    'The economics team models how technology affects work and growth.',
  );
  expect(stream?.body.prompt).toContain('Use the browser tools');
  const modelCatalog = requests.find((request) =>
    String(request.url).includes('/catalogs/models'),
  );
  expect(String(modelCatalog?.url)).toMatch(/\/catalogs\/models$/);

  const hydrated = await worker.evaluate(async () => {
    const response = await fetch('http://127.0.0.1:37215/v1/resources/hydrate', {
      method: 'POST',
      body: JSON.stringify({
        ids: ['resource-economic-outlook'],
        includeContent: true,
      }),
    });
    return response.json();
  });
  expect(hydrated.data.resources[0].resource.title).toBe('Economic outlook');
});

test('ignora eventos tardíos de un stream detenido al iniciar otro', async () => {
  await worker.evaluate(() => {
    const state = (globalThis as any).__test;
    state.mode = 'late-stop';
    state.streamDelay = 350;
  });
  const composer = page.getByRole('textbox', { name: /Pregunta a Many/ });
  await composer.fill('First run');
  await page
    .getByRole('button', { name: 'Preguntar a Many', exact: true })
    .click();
  await page.getByRole('button', { name: 'Detener', exact: true }).click();

  await worker.evaluate(() => {
    const state = (globalThis as any).__test;
    state.mode = 'rich';
    state.streamDelay = 0;
  });
  await composer.fill('Second run');
  await page
    .getByRole('button', { name: 'Preguntar a Many', exact: true })
    .click();
  await expect(page.locator('.rendered-markdown h2')).toHaveText('Key ideas');
  await page.waitForTimeout(450);
  await expect(
    page.getByText('STALE_RESPONSE_MUST_NOT_APPEAR', { exact: true }),
  ).toHaveCount(0);

  const requests = await recordedRequests();
  expect(
    requests.filter((request) =>
      String(request.url).endsWith('/ai/stream'),
    ),
  ).toHaveLength(2);
  expect(
    requests.some((request) => String(request.url).endsWith('/ai/cancel')),
  ).toBe(true);
});

test('busca, abre, fija y elimina sesiones enriquecidas', async () => {
  await page
    .getByRole('tab', { name: 'Historial', exact: true })
    .click();
  const search = page.getByRole('textbox', {
    name: 'Buscar conversaciones',
  });
  await search.fill('roadmap');
  await expect(
    page.getByText('Research roadmap', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Desktop conversation', { exact: true }),
  ).toHaveCount(0);

  const roadmap = page
    .locator('li')
    .filter({ hasText: 'Research roadmap' });
  await roadmap.hover();
  await roadmap
    .getByRole('button', { name: 'Fijar conversación' })
    .click();
  await expect(
    roadmap.getByRole('button', { name: 'Desfijar conversación' }),
  ).toBeAttached();

  await roadmap.hover();
  await roadmap
    .getByRole('button', { name: 'Eliminar conversación' })
    .click();
  await expect(
    page.getByText('¿Eliminar esta conversación?', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Eliminar conversación', exact: true })
    .last()
    .click();
  await expect(
    page.getByText('Research roadmap', { exact: true }),
  ).toHaveCount(0);

  await search.fill('Desktop');
  await page
    .getByRole('button', { name: /Desktop conversation/ })
    .click();
  await expect(page.getByText('Earlier answer', { exact: true })).toBeVisible();
  await expect(page.getByText('web search', { exact: true })).toBeVisible();
  await expect(
    page.getByText('1024 tokens', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('tab', { name: 'Chat', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');

  const requests = await recordedRequests();
  expect(
    requests.some(
      (request) =>
        String(request.url).endsWith('/research-roadmap/pin') &&
        request.method === 'PUT',
    ),
  ).toBe(true);
  expect(
    requests.some(
      (request) =>
        String(request.url).endsWith('/research-roadmap') &&
        request.method === 'DELETE',
    ),
  ).toBe(true);
});

test('muestra contexto, capacidades, configuración y herramientas de página', async () => {
  await page.getByTitle('Recursos').click();
  await page
    .getByPlaceholder('Buscar recursos')
    .fill('economic outlook');
  await page
    .getByRole('button', { name: /Economic outlook/ })
    .click();
  await page
    .getByRole('tab', { name: 'Contexto', exact: true })
    .click();

  await expect(
    page
      .locator('.many-context')
      .getByText('Scenarios for our economic future', { exact: true })
      .first(),
  ).toBeVisible();
  await expect(page.getByText('Economic outlook', { exact: true })).toBeVisible();
  await expect(page.getByText('Capacidades', { exact: true })).toBeVisible();
  await expect(page.getByText('Configuración', { exact: true })).toBeVisible();
  await expect(page.getByText('GPT 5.1', { exact: true })).toBeVisible();
  await expect(page.getByText('openai', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('switch', { name: 'Herramientas web' }),
  ).toBeChecked();
  await page.getByRole('switch', { name: 'Herramientas web' }).click();
  await expect(
    page.getByRole('switch', { name: 'Herramientas web' }),
  ).not.toBeChecked();
  await expect(
    page.getByText('Herramientas de página', { exact: true }),
  ).toBeVisible();
});

test('reanuda una aprobación HITL con el contrato v2', async () => {
  await setStreamMode('approval');
  await page
    .getByRole('textbox', { name: /Pregunta a Many/ })
    .fill('Create a reviewed note');
  await page
    .getByRole('button', { name: 'Preguntar a Many', exact: true })
    .click();

  await expect(
    page.getByText('Confirmación necesaria', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Nueva conversación', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('textbox', { name: /Pregunta a Many/ }),
  ).toBeDisabled();
  await expect(
    page.getByRole('tab', { name: 'Historial', exact: true }),
  ).toBeDisabled();
  await expect(page.getByText(/Create “Reviewed note” in Dome/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Editar acción', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Aprobar', exact: true })
    .click();
  await expect(
    page.getByText('Approved action completed.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Nueva conversación', exact: true }),
  ).toBeEnabled();

  const requests = await recordedRequests();
  const resume = requests.find((request) =>
    String(request.url).endsWith('/ai/resume'),
  );
  expect(resume?.body.decision).toEqual({ type: 'approve' });
});

test('revisa una browser-tool antes de modificar la página', async () => {
  await setStreamMode('browser-fill');
  await page
    .getByRole('textbox', { name: /Pregunta a Many/ })
    .fill('Fill the search field with Ada Lovelace');
  await page
    .getByRole('button', { name: 'Preguntar a Many', exact: true })
    .click();

  const review = page.getByRole('alertdialog', {
    name: 'Revisar acción en la web',
  });
  await expect(review).toContainText('Search fixture');
  await expect(
    sourcePage.getByRole('textbox', { name: 'Search fixture' }),
  ).toHaveValue('');
  await review
    .getByRole('button', { name: 'Ejecutar acción', exact: true })
    .click();
  await expect(
    sourcePage.getByRole('textbox', { name: 'Search fixture' }),
  ).toHaveValue('Ada Lovelace');
  await expect(page.getByText('Action completed.', { exact: true })).toBeVisible();
});

test('permite al agente navegar la pestaña seleccionada', async () => {
  await setStreamMode('browser-navigate');
  await page
    .getByRole('textbox', { name: /Pregunta a Many/ })
    .fill('Navega a la siguiente página');
  await page
    .getByRole('button', { name: 'Preguntar a Many', exact: true })
    .click();

  await expect(sourcePage).toHaveURL('https://dome-fixture.test/next');
  await expect(
    page.getByText('Action completed.', { exact: true }),
  ).toBeVisible();
});

test('preserva captura, notas y contactos como acciones secundarias', async () => {
  await page
    .getByRole('button', { name: 'Capturar', exact: true })
    .click();
  await expect(
    page.getByRole('tab', { name: 'Chat', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.many-assistant')).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Volver a Many', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Guardar en Dome', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: /Abrir en Dome/ }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Volver a Many', exact: true })
    .click();
  await expect(page.locator('#dome-pane-capture')).toBeHidden();
  await expect(page.locator('.many-assistant')).toBeVisible();
  await page
    .getByRole('button', { name: 'Resumir página', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Añadir a la nota', exact: true })
    .click();
  await expect(
    page.locator('#dome-pane-note .ProseMirror'),
  ).toContainText('A useful insight.');
  await expect(
    page.locator('#dome-pane-note .ProseMirror'),
  ).toContainText('Original note.');
  await expect(page.locator('.many-assistant')).toBeHidden();
  await page
    .getByRole('button', { name: 'Volver a Many', exact: true })
    .click();
  await expect(page.locator('#dome-pane-note')).toBeHidden();

  await page
    .getByRole('button', { name: 'Contacto', exact: true })
    .click();
  const saveContact = page.getByRole('button', {
    name: 'Guardar contacto',
    exact: true,
  });
  await expect(saveContact).toBeDisabled();
  await page.getByLabel('Nombre completo').fill('Ada Lovelace');
  await page
    .getByLabel('Cargo o descripción')
    .fill('Mathematician');
  await page.getByLabel('Correo electrónico').fill('ada@example.test');
  await page
    .getByRole('button', { name: 'Volver a Many', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: /Pregunta a Many/ })
    .fill('Resume este perfil');
  await page
    .getByRole('button', { name: 'Preguntar a Many', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Añadir al contexto del contacto',
      exact: true,
    })
    .click();
  await expect(page.getByLabel('Contexto y notas')).toHaveValue(
    /A useful insight/,
  );
  await expect(page.locator('.many-assistant')).toBeHidden();
  await saveContact.click();

  const requests = await recordedRequests();
  const capture = requests.find((request) =>
    String(request.url).endsWith('/capture-url'),
  );
  expect(capture?.body.title).toBe('Scenarios for our economic future');
  const contact = requests.find((request) =>
    String(request.url).endsWith('/contact'),
  );
  expect(contact?.body.displayName).toBe('Ada Lovelace');
  expect(contact?.body.primaryEmail).toBe('ada@example.test');
});

test('preserva borradores, citas y conflictos de notas', async () => {
  await page.getByRole('button', { name: 'Nota', exact: true }).click();
  const editor = page.locator('#dome-pane-note .ProseMirror');
  await editor.fill('My unsaved draft.');
  await worker.evaluate(async () => {
    const chrome = (globalThis as any).chrome;
    const tabs = await chrome.tabs.query({
      url: 'https://dome-fixture.test/*',
    });
    await chrome.storage.local.set({
      'dome.pendingQuote': {
        text: 'A cited passage',
        url: tabs[0].url,
        title: tabs[0].title,
        id: 'pending-quote',
      },
    });
  });
  await expect(editor).toContainText('A cited passage');
  await page.reload();
  await expect(page.locator('.connection-dot.connected')).toBeVisible();
  await page.getByRole('button', { name: 'Nota', exact: true }).click();
  await worker.evaluate(() => {
    (globalThis as any).__test.conflict = true;
  });
  await expect(editor).toContainText('My unsaved draft.');
  await page
    .getByRole('button', { name: 'Guardar nota', exact: true })
    .click();
  await expect(page.locator('.conflict')).toBeVisible();
  await page
    .getByRole('button', { name: 'Guardar una copia', exact: true })
    .click();
  await expect(page.locator('.conflict')).toHaveCount(0);

  const requests = await recordedRequests();
  const created = requests.find(
    (request) =>
      String(request.url).endsWith('/notes') &&
      request.method === 'POST',
  );
  expect(created?.body.markdown).toContain('My unsaved draft.');
  expect(created?.body.markdown).toContain('A cited passage');
});

test('mantiene regresión visual clara y oscura en 320, 400 y 600 px', async () => {
  const panel = page.locator('.dome-panel');
  for (const width of [320, 400, 600]) {
    await page.setViewportSize({ width, height: 820 });
    await expectNoHorizontalOverflow();
    await expect(panel).toHaveScreenshot(`many-light-${width}.png`, {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      maxDiffPixelRatio: 0.02,
    });
  }

  await page
    .getByRole('button', { name: 'Más acciones', exact: true })
    .click();
  await page
    .getByRole('menuitem', { name: 'Cambiar apariencia', exact: true })
    .click();
  await expect(panel).toHaveClass(/dark/);
  for (const width of [320, 400, 600]) {
    await page.setViewportSize({ width, height: 820 });
    await expectNoHorizontalOverflow();
    await expect(panel).toHaveScreenshot(`many-dark-${width}.png`, {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      maxDiffPixelRatio: 0.02,
    });
  }
});
