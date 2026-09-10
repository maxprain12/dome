import { createRequire } from 'node:module';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const {
  isAllowedExtensionOrigin,
  corsHeaders,
  PairBodySchema,
  MAX_BODY_BYTES,
} = require('../browser-extension/protocol.cjs');
const { createPairing, sha256 } = require('../browser-extension/pairing.cjs');
const { formatWebCitation } = require('../browser-extension/citation.cjs');
const { createServer } = require('../browser-extension/server.cjs');
const { createManyService, buildUserMessage } = require('../browser-extension/many-service.cjs');
const { canonicalizeHttpUrl, detectMediaKind, youtubeId } = require('../browser-extension/capture-service.cjs');

function memoryQueries() {
  const settings = new Map();
  return {
    getSetting: { get: (key) => (settings.has(key) ? { value: settings.get(key) } : undefined) },
    setSetting: { run: (key, value) => settings.set(key, value) },
  };
}

describe('browser extension protocol', () => {
  it('allows only extension origins', () => {
    assert.equal(isAllowedExtensionOrigin('chrome-extension://abcd'), true);
    assert.equal(isAllowedExtensionOrigin('moz-extension://abcd'), true);
    assert.equal(isAllowedExtensionOrigin('safari-web-extension://abcd'), true);
    assert.equal(isAllowedExtensionOrigin('null'), true);
    assert.equal(isAllowedExtensionOrigin('https://evil.example'), false);
    assert.equal(corsHeaders('https://evil.example')['Access-Control-Allow-Origin'], 'null');
    assert.equal(corsHeaders('chrome-extension://abcd')['Access-Control-Allow-Origin'], 'chrome-extension://abcd');
  });

  it('rejects tiny pairing payloads', () => {
    assert.equal(PairBodySchema.safeParse({ code: 'ab' }).success, false);
    assert.equal(PairBodySchema.safeParse({ code: 'ABCD2345' }).success, true);
    assert.ok(MAX_BODY_BYTES < 2_000_000);
  });
});

describe('browser extension pairing', () => {
  it('stores only token hashes and can revoke clients', () => {
    const queries = memoryQueries();
    const pairing = createPairing({ getQueries: () => queries });
    const started = pairing.startPairing();
    const paired = pairing.pair({ code: started.code, clientName: 'Chrome' });
    assert.match(paired.token, /^dxt_[0-9a-f]+$/);
    assert.equal(pairing.resolveToken(paired.token)?.id, paired.clientId);
    const stored = JSON.parse(queries.getSetting.get('browser_extension_clients').value);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].tokenHash, sha256(paired.token));
    assert.equal(JSON.stringify(stored).includes(paired.token), false);
    const listed = pairing.listClients();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].name, 'Chrome');
    pairing.revoke(paired.clientId);
    assert.equal(pairing.resolveToken(paired.token), null);
  });

  it('rejects invalid and expired codes', () => {
    const pairing = createPairing({ getQueries: () => memoryQueries() });
    assert.throws(() => pairing.pair({ code: 'NOPE1234' }), /No pairing code/);
    const queries = memoryQueries();
    const live = createPairing({ getQueries: () => queries });
    const started = live.startPairing();
    assert.throws(() => live.pair({ code: 'ZZZZZZZZ' }), /Invalid pairing code/);
    assert.equal(sha256('a').length, 64);
    live.cancelPairing();
    assert.throws(() => live.pair({ code: started.code }), /No pairing code/);
  });
});

describe('browser extension citation and urls', () => {
  it('formats a portable markdown quote', () => {
    const md = formatWebCitation({
      text: 'Quote me',
      title: 'Doc',
      url: 'https://example.com/x',
      capturedAt: Date.parse('2026-01-02T00:00:00Z'),
    });
    assert.match(md, /> Quote me/);
    assert.match(md, /\[Doc\]\(https:\/\/example.com\/x\)/);
    assert.match(md, /\(2026-01-02\)/);
  });

  it('canonicalizes tracking params and detects youtube', () => {
    const url = canonicalizeHttpUrl('https://www.youtube.com/watch?v=abcdefghijk&utm_source=x&si=1');
    assert.equal(url.includes('utm_source'), false);
    assert.equal(detectMediaKind(url), 'youtube');
    assert.equal(youtubeId(url), 'abcdefghijk');
  });
});

describe('browser extension Many prompt', () => {
  it('clips page text and keeps the user question', () => {
    const msg = buildUserMessage({
      action: 'ask',
      prompt: '¿De qué trata?',
      text: 'hello',
      url: 'https://example.com',
      title: 'Page',
    });
    assert.match(msg, /¿De qué trata\?/);
    assert.match(msg, /hello/);
  });
});

describe('browser extension HTTP server', () => {
  let server;

  afterEach(async () => {
    if (server) await server.stop();
    server = null;
  });

  async function boot() {
    const queries = memoryQueries();
    const pairing = createPairing({ getQueries: () => queries });
    const started = pairing.startPairing();
    const capture = {
      context: () => ({ projectId: 'default', projectName: 'Default', projects: [{ id: 'default', name: 'Default' }] }),
      listProjects: () => [{ id: 'default', name: 'Default' }],
      listNotes: () => [],
      getNote: () => ({ id: 'n1', markdown: 'hi', updatedAt: 1, title: 'N', projectId: 'default' }),
      createNote: () => ({ id: 'n1' }),
      updateNote: () => {
        const err = new Error('Note was edited elsewhere. Reload before saving.');
        err.statusCode = 409;
        err.payload = { conflict: true, note: { id: 'n1', markdown: 'server', updatedAt: 9, title: 'N', projectId: 'default' } };
        throw err;
      },
      appendSelection: () => ({}),
      saveContact: () => ({ person: { displayName: 'Ada' } }),
      saveUrl: () => ({ id: 'u1', reused: false }),
    };
    const many = createManyService({
      getDatabase: () => ({}),
      resolveProviderConfig: async () => ({ provider: 'openai', model: 'gpt', apiKey: 'k', baseUrl: undefined }),
      runManyAgent: async ({ onChunk }) => {
        onChunk?.({ type: 'text', text: 'Hello from Many' });
        onChunk?.({ type: 'done' });
        return { ok: true };
      },
    });
    server = createServer({ pairing, capture, many, port: 0 });
    const listen = await server.listen();
    assert.equal(listen.success, true);
    return { pairing, port: listen.port, code: started.code };
  }

  it('pairs, authenticates, blocks bad origins and oversized bodies', async () => {
    const { port, code } = await boot();
    const origin = 'chrome-extension://dome-test';
    const pairRes = await fetch(`http://127.0.0.1:${port}/v1/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ code, clientName: 'Test' }),
    });
    const paired = await pairRes.json();
    assert.equal(paired.success, true);
    const token = paired.data.token;

    const blocked = await fetch(`http://127.0.0.1:${port}/v1/context`, {
      headers: { Authorization: `Bearer ${token}`, Origin: 'https://evil.example' },
    });
    assert.equal(blocked.status, 403);

    const ok = await fetch(`http://127.0.0.1:${port}/v1/context`, {
      headers: { Authorization: `Bearer ${token}`, Origin: origin },
    });
    assert.equal(ok.status, 200);

    const unauth = await fetch(`http://127.0.0.1:${port}/v1/context`, {
      headers: { Origin: origin },
    });
    assert.equal(unauth.status, 401);

    const conflict = await fetch(`http://127.0.0.1:${port}/v1/notes/n1`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: 'x', expectedUpdatedAt: 1 }),
    });
    assert.equal(conflict.status, 409);
    const conflictBody = await conflict.json();
    assert.equal(conflictBody.conflict, true);

    let tooBigStatus = 0;
    try {
      const huge = 'a'.repeat(1_000_100);
      const tooBig = await fetch(`http://127.0.0.1:${port}/v1/notes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'default', title: 't', markdown: huge }),
      });
      tooBigStatus = tooBig.status;
    } catch {
      tooBigStatus = 413;
    }
    assert.ok(tooBigStatus === 413 || tooBigStatus === 400 || tooBigStatus === 500);

    const stream = await fetch(`http://127.0.0.1:${port}/v1/ai/stream`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'summarize', text: 'page text' }),
    });
    assert.equal(stream.status, 200);
    const sse = await stream.text();
    assert.match(sse, /Hello from Many/);
  });
});

describe('Many browser sessions', () => {
  function service(runManyAgent = async () => ({})) {
    const metas = [{ id: 'desktop-session', updatedAt: 2 }, { id: 'canvas-hidden', updatedAt: 1 }];
    const repo = { list: async () => metas, open: async () => ({ buildContext: async () => ({ messages: [{ role: 'user', content: 'Earlier question' }, { role: 'assistant', content: [{ type: 'text', text: 'Earlier answer' }, { type: 'thinking', thinking: 'Private reasoning' }] }] }) }) };
    return createManyService({ getDatabase: () => ({}), resolveProviderConfig: async () => ({ provider: 'test', model: 'test' }), runManyAgent,
      getBridge: () => ({ SESSION_CWD: 'dome', getSessionRepo: async () => repo, findSessionMetadata: async id => metas.find(meta => meta.id === id), isRootSessionMeta: meta => !meta.id.startsWith('canvas-') }),
    });
  }
  it('lists root conversations and exposes only user-facing text', async () => {
    const many = service();
    assert.deepEqual((await many.listSessions()).sessions.map(s => s.id), ['desktop-session']);
    const state = await many.readSession('desktop-session');
    assert.equal(state.messages[1].text, 'Earlier answer');
    await assert.rejects(many.readSession('canvas-hidden'), /not available/);
  });
  it('continues an existing thread and validates new conversation ids', async () => {
    const calls = [];
    const many = service(async options => { calls.push(options); });
    await many.stream({ action: 'ask', text: 'Current page', prompt: 'Continue', threadId: 'desktop-session', streamId: 'one' });
    await many.stream({ action: 'ask', text: 'Next page', prompt: 'Next', threadId: 'desktop-session', streamId: 'two' });
    assert.deepEqual(calls.map(call => call.threadId), ['desktop-session', 'desktop-session']);
    assert.match(calls[1].messages[1].content, /Next page/);
    await assert.rejects(many.stream({ action: 'ask', text: 'x', threadId: 'unknown' }), /not available/);
    await assert.rejects(many.stream({ action: 'ask', text: 'x', threadId: 'canvas-hidden' }), /not available/);
  });
});

it('executes browser tools through authenticated request/result round trips', async () => {
  let many;
  const results = [];
  many = createManyService({ getDatabase: () => ({}), resolveProviderConfig: async () => ({ provider: 'test', model: 'test' }),
    runManyAgent: async ({ browserTools, signal }) => {
      assert.ok(browserTools.some(tool => tool.name === 'dome_create_note'));
      const read = browserTools.find(tool => tool.name === 'browser_read_page');
      results.push(await read.execute('call', {}, signal));
      await assert.rejects(browserTools.find(tool => tool.name === 'browser_click').execute('call', { snapshotId: 123 }, signal));
    },
  });
  await many.stream({ action: 'ask', text: 'page', browserTools: true, clientId: 'paired-client', streamId: 'stream', onChunk: event => {
    if (event.type !== 'browser_tool') return;
    assert.throws(() => many.completeTool({ ...event, clientId: 'other-client', result: {} }), /not available/);
    many.completeTool({ ...event, clientId: 'paired-client', result: { success: true, title: 'Real page' } });
    assert.throws(() => many.completeTool({ ...event, clientId: 'paired-client', result: {} }), /not available/);
  } });
  assert.match(results[0].content[0].text, /Real page/);
});
