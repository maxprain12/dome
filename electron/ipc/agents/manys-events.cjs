'use strict';
const { z } = require('zod');
const { fetchWithDomeAuth, getDomeProviderBaseUrl } = require('../../auth/dome-oauth.cjs');

/**
 * The live feed of what the Manys are doing: text as it is written, tool calls, task changes.
 *
 * The provider serves it as server-sent events from a durable cursor. The main process holds the
 * session token, reads the stream and relays each event to the window that asked, so the renderer
 * never sees a credential. A window gets one subscription. The first connection starts from "now";
 * after a break it resumes from the last event it delivered, so nothing is repeated or skipped.
 */
const NoPayload = z.union([z.undefined(), z.null(), z.object({}).strict()]);
const MIN_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 15000;
const MAX_EVENT_BYTES = 262144;
const FORWARDED = ['sequence', 'kind', 'task_id', 'many_id', 'data'];

/** Splits an SSE byte stream into events. Comments and malformed events are skipped. */
function createSseParser(onEvent) {
  let buffer = '';
  return (chunk) => {
    buffer += chunk;
    for (;;) {
      const end = buffer.search(/\r?\n\r?\n/);
      if (end < 0) break;
      const raw = buffer.slice(0, end);
      buffer = buffer.slice(end).replace(/^\r?\n\r?\n/, '');
      const data = raw.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
      if (!data || data.length > MAX_EVENT_BYTES) continue;
      try {
        onEvent(JSON.parse(data));
      } catch {
        // A broken event is not worth dropping the feed.
      }
    }
    if (buffer.length > MAX_EVENT_BYTES * 2) buffer = '';
  };
}

function register({
  ipcMain,
  windowManager,
  database,
  fetchAuth = fetchWithDomeAuth,
  providerUrl = getDomeProviderBaseUrl,
  sleep = (ms, signal) => new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  }),
}) {
  const feeds = new Map();

  const stop = (senderId) => {
    const feed = feeds.get(senderId);
    if (!feed) return;
    feeds.delete(senderId);
    feed.controller.abort();
  };

  const run = async (sender, feed) => {
    let cursor = 'latest';
    let backoff = MIN_BACKOFF_MS;
    const { signal } = feed.controller;
    while (!signal.aborted && !sender.isDestroyed()) {
      try {
        const base = String(providerUrl()).replace(/\/$/, '');
        const response = await fetchAuth(database, `${base}/api/v1/manys/events?after=${cursor}`, {
          headers: { accept: 'text/event-stream' },
          signal,
        });
        if (!response.ok || !response.body) throw new Error(`events_${response.status}`);
        backoff = MIN_BACKOFF_MS;
        const decoder = new TextDecoder();
        const parse = createSseParser((row) => {
          const sequence = Number(row?.sequence);
          if (!Number.isFinite(sequence) || sequence <= (cursor === 'latest' ? 0 : cursor)) return;
          cursor = sequence;
          const event = {};
          for (const key of FORWARDED) event[key] = key === 'sequence' ? sequence : row[key];
          if (!sender.isDestroyed()) sender.send('manys:events:event', event);
        });
        for await (const chunk of response.body) {
          if (signal.aborted) break;
          parse(decoder.decode(chunk, { stream: true }));
        }
        // The provider ends each stream after about a minute: reconnect straight away.
      } catch {
        if (signal.aborted) break;
        await sleep(backoff, signal);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      }
    }
  };

  ipcMain.handle('manys:events:subscribe', async (event, payload) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'unauthorized' };
    if (!NoPayload.safeParse(payload).success) return { success: false, error: 'invalid_request' };
    const sender = event.sender;
    if (feeds.has(sender.id)) return { success: true };
    const feed = { controller: new AbortController() };
    feeds.set(sender.id, feed);
    sender.once('destroyed', () => stop(sender.id));
    void run(sender, feed).finally(() => {
      if (feeds.get(sender.id) === feed) feeds.delete(sender.id);
    });
    return { success: true };
  });

  ipcMain.handle('manys:events:unsubscribe', async (event, payload) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'unauthorized' };
    if (!NoPayload.safeParse(payload).success) return { success: false, error: 'invalid_request' };
    stop(event.sender.id);
    return { success: true };
  });
}

module.exports = { register, createSseParser };
