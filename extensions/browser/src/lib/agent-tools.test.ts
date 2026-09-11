import { afterEach, expect, it, vi } from 'vitest';
import { createToolRunner } from './agent-tools';
import type { AgentSnapshot, ToolRequest } from './agent-tools';

const pageSnapshot: AgentSnapshot = {
  tabId: 12,
  url: 'https://example.test/article',
  title: 'Example article',
  selection: '',
  readableText: 'Readable page text',
  contact: null,
  headings: [],
  snapshotId: 'snapshot-1',
  elements: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('solicita acceso y reintenta la lectura de la pestaña para el agente', async () => {
  const sendMessage = vi
    .fn()
    .mockResolvedValueOnce({ ...pageSnapshot, error: 'pageAccess' })
    .mockResolvedValueOnce(pageSnapshot);
  vi.stubGlobal('browser', { runtime: { sendMessage } });
  const review = vi.fn().mockResolvedValue(true);
  const runTool = createToolRunner({
    token: 'token',
    projectId: 'project',
    tabId: 12,
    review,
    signal: new AbortController().signal,
  });

  const result = await runTool({
    type: 'browser_tool',
    callId: 'read-1',
    streamId: 'stream-1',
    name: 'browser_read_page',
    args: {},
  } satisfies ToolRequest);

  expect(result).toEqual({ success: true, data: pageSnapshot });
  expect(review).toHaveBeenCalledWith({
    name: 'browser_read_page',
    detail: pageSnapshot.url,
    origin: 'https://example.test',
  });
  expect(sendMessage).toHaveBeenCalledTimes(2);
});

it('permite navegar aunque la página actual todavía no tenga contexto', async () => {
  const sendMessage = vi
    .fn()
    .mockResolvedValueOnce({ success: true, url: 'https://example.test/next' })
    .mockResolvedValueOnce(pageSnapshot);
  vi.stubGlobal('browser', {
    runtime: { sendMessage },
    permissions: { contains: vi.fn().mockResolvedValue(true) },
  });
  const runTool = createToolRunner({
    token: 'token',
    projectId: 'project',
    tabId: 12,
    review: vi.fn(),
    signal: new AbortController().signal,
  });

  const result = await runTool({
    type: 'browser_tool',
    callId: 'navigate-1',
    streamId: 'stream-1',
    name: 'browser_navigate',
    args: { url: 'https://example.test/next' },
  } satisfies ToolRequest);

  expect(result).toEqual({
    success: true,
    url: 'https://example.test/next',
    data: pageSnapshot,
  });
  expect(sendMessage).toHaveBeenCalledWith({
    type: 'DOME_NAVIGATE',
    tabId: 12,
    url: 'https://example.test/next',
  });
});

it('devuelve un snapshot fresco después de hacer scroll', async () => {
  const nextSnapshot = { ...pageSnapshot, snapshotId: 'snapshot-2', readableText: 'Experiencia\nEngineer' };
  const sendMessage = vi
    .fn()
    .mockResolvedValueOnce(pageSnapshot)
    .mockResolvedValueOnce({ ok: true })
    .mockResolvedValueOnce(nextSnapshot);
  vi.stubGlobal('browser', { runtime: { sendMessage } });
  const runTool = createToolRunner({
    token: 'token',
    projectId: 'project',
    tabId: 12,
    review: vi.fn(),
    signal: new AbortController().signal,
  });

  const result = await runTool({
    type: 'browser_tool',
    callId: 'scroll-1',
    streamId: 'stream-1',
    name: 'browser_scroll',
    args: { headingText: 'Experiencia' },
  } satisfies ToolRequest);

  expect(result).toEqual({ success: true, data: nextSnapshot });
  expect(sendMessage).toHaveBeenNthCalledWith(2, {
    type: 'DOME_PAGE_ACTION',
    tabId: 12,
    url: pageSnapshot.url,
    action: { kind: 'scroll', headingText: 'Experiencia' },
  });
});

it('adjunta una captura de la pestaña visible cuando se pide screenshot', async () => {
  const sendMessage = vi
    .fn()
    .mockResolvedValueOnce(pageSnapshot)
    .mockResolvedValueOnce({ dataUrl: 'data:image/jpeg;base64,/9j/4AAQ' });
  vi.stubGlobal('browser', { runtime: { sendMessage } });
  const runTool = createToolRunner({
    token: 'token',
    projectId: 'project',
    tabId: 12,
    review: vi.fn(),
    signal: new AbortController().signal,
  });

  const result = await runTool({
    type: 'browser_tool',
    callId: 'shot-1',
    streamId: 'stream-1',
    name: 'browser_screenshot',
    args: {},
  } satisfies ToolRequest);

  expect(result).toEqual({
    success: true,
    data: {
      url: pageSnapshot.url,
      title: pageSnapshot.title,
      screenshot: 'data:image/jpeg;base64,/9j/4AAQ',
    },
  });
  expect(sendMessage).toHaveBeenCalledWith({
    type: 'DOME_CAPTURE_TAB',
    tabId: 12,
  });
});
