
'use strict';
const crypto = require('node:crypto');
const { z } = require('zod');
const sessions = new Map();
const pending = new Map();
const LEASE_MS = 15000;
const Poll = z.object({ sessionId: z.string().uuid(), url: z.string().url().max(4000), enabled: z.boolean() }).strict();
const Result = z.object({ sessionId: z.string().uuid(), callId: z.string().uuid(), result: z.object({
  success: z.boolean(), error: z.string().max(500).optional(),
  data: z.object({ url: z.string().url().max(4000), title: z.string().max(1000).optional(),
    readableText: z.string().max(100000).optional(), limitations: z.array(z.string().max(200)).max(50).optional(),
  }).optional(),
}).strict() }).strict();
function expire() {
  for (const [id, session] of sessions) if (session.expiresAt < Date.now()) remove(id);
}
function remove(id) {
  sessions.delete(id);
  for (const item of pending.values()) if (item.sessionId === id) item.finish({ success: false, error: 'browser_disconnected' });
}
function poll(clientId, raw) {
  const input = Poll.parse(raw);
  expire();
  const existing = sessions.get(input.sessionId);
  if (existing && existing.clientId !== clientId) throw new Error('session_owner_mismatch');
  if (!input.enabled) { remove(input.sessionId); return { requests: [] }; }
  const url = new URL(input.url);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('unsupported_page');
  sessions.set(input.sessionId, { clientId, url: url.href, expiresAt: Date.now() + LEASE_MS });
  const requests = [];
  for (const item of pending.values()) {
    if (item.sessionId === input.sessionId && !item.delivered) {
      item.delivered = true;
      requests.push({ callId: item.callId, name: 'browser_read_page', args: { includeScreenshot: false }, expectedUrl: item.url });
    }
  }
  return { requests };
}
function status() {
  expire();
  return { sessions: [...sessions].map(([sessionId, item]) => ({ sessionId, url: item.url })),
    state: sessions.size ? 'connected' : 'requires_connection' };
}
function read(url, signal) {
  expire();
  const match = [...sessions].find(([, item]) => item.url === url);
  if (!match) return Promise.resolve({ success: false, status: 'requires_connection', error: 'selected_tab_required' });
  const [sessionId] = match;
  if ([...pending.values()].some((item) => item.sessionId === sessionId)) return Promise.resolve({ success: false, error: 'browser_busy' });
  const callId = crypto.randomUUID();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      pending.delete(callId);
      resolve(result);
    };
    const abort = () => finish({ success: false, error: 'cancelled' });
    const timer = setTimeout(() => finish({ success: false, error: 'browser_timeout' }), 20000);
    pending.set(callId, { callId, sessionId, url, finish, delivered: false });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
function complete(clientId, raw) {
  const input = Result.parse(raw);
  expire();
  const session = sessions.get(input.sessionId);
  const item = pending.get(input.callId);
  if (!session || session.clientId !== clientId || item?.sessionId !== input.sessionId) throw new Error('request_owner_mismatch');
  if (input.result.success && input.result.data?.url !== item.url) {
    item.finish({ success: false, error: 'selected_tab_changed' });
  } else { item.finish(input.result); }
  return { accepted: true };
}
function revoke(clientId) {
  for (const [id, session] of sessions) if (session.clientId === clientId) remove(id);
}
function stop() { for (const id of sessions.keys()) remove(id); }
module.exports = { poll, complete, read, status, revoke, stop, Poll, Result };
