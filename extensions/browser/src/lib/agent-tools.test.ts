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
      ...pageSnapshot,
      screenshot: 'data:image/jpeg;base64,/9j/4AAQ',
    },
  });
  expect(sendMessage).toHaveBeenCalledWith({
    type: 'DOME_CAPTURE_TAB',
    tabId: 12,
  });
});

it('does not report success when the post-navigation page is inaccessible', async () => {
  vi.stubGlobal('browser', {
    runtime: { sendMessage: vi.fn().mockResolvedValueOnce({ success: true }).mockResolvedValue({ ...pageSnapshot, error: 'unsupportedPage' }) },
    permissions: { contains: vi.fn().mockResolvedValue(true) },
  });
  const run = createToolRunner({ token: 'token', projectId: 'project', tabId: 12, review: vi.fn(), signal: new AbortController().signal });
  const result = await run({ type: 'browser_tool', callId: 'nav', streamId: 'stream', name: 'browser_navigate', args: { url: 'https://example.test/next' } });
  expect(result.success).toBe(false);
});

it('does not dispatch a reviewed action after cancellation', async () => {
  const snapshot = { ...pageSnapshot, elements: [{ id: 'e1', label: 'Severity', role: 'select' }] };
  const sendMessage = vi.fn().mockResolvedValue(snapshot);
  vi.stubGlobal('browser', { runtime: { sendMessage } });
  const controller = new AbortController();
  const review = vi.fn(async () => { controller.abort(); return true; });
  const run = createToolRunner({ token: 'token', projectId: 'project', tabId: 12, review, signal: controller.signal });
  await run({ type: 'browser_tool', callId: 'read', streamId: 'stream', name: 'browser_read_page', args: {} });
  const result = await run({ type: 'browser_tool', callId: 'select', streamId: 'stream', name: 'browser_select', args: { snapshotId: snapshot.snapshotId, elementId: 'e1', value: 'high' } });
  expect(result.success).toBe(false);
  expect(sendMessage).toHaveBeenCalledTimes(1);
});

it('waits for updated text and stops on an explicit timeout', async () => {
  vi.useFakeTimers();
  try {
    const sendMessage = vi.fn().mockResolvedValueOnce(pageSnapshot).mockResolvedValue({ ...pageSnapshot, readableText: 'Loaded results' });
    vi.stubGlobal('browser', { runtime: { sendMessage } });
    const run = createToolRunner({ token: 'token', projectId: 'project', tabId: 12, review: vi.fn(), signal: new AbortController().signal });
    const request: ToolRequest = { type: 'browser_tool', callId: 'wait', streamId: 'stream', name: 'browser_wait', args: { text: 'Loaded results', timeoutMs: 1000 } };
    const waiting = run(request);
    await vi.advanceTimersByTimeAsync(300);
    expect((await waiting).success).toBe(true);
    const timeout = run({ ...request, args: { text: 'Missing text', timeoutMs: 250 } });
    await vi.advanceTimersByTimeAsync(300);
    expect((await timeout).success).toBe(false);
  } finally { vi.useRealTimers(); }
});

it('returns a fresh snapshot when continuing with a previous-turn reference', async () => {
  const sendMessage = vi.fn().mockResolvedValue(pageSnapshot);
  vi.stubGlobal('browser', { runtime: { sendMessage } });
  const review = vi.fn();
  const run = createToolRunner({ token: 'token', projectId: 'project', tabId: 12, review, signal: new AbortController().signal });
  const result = await run({ type: 'browser_tool', callId: 'continued', streamId: 'new-turn', name: 'browser_click', args: { element_id: 'old', snapshot_id: 'old-snapshot' } });
  expect(result.success).toBe(false);
  expect(result.data).toEqual(pageSnapshot);
  expect(review).not.toHaveBeenCalled();
  expect(sendMessage).toHaveBeenCalledTimes(1);
});
