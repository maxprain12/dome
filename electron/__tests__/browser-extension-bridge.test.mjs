import { createRequire } from 'node:module';
import { request as httpRequest } from 'node:http';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const {
  isAllowedExtensionOrigin,
  corsHeaders,
  requestOrigin,
  EXTENSION_ORIGIN_HEADER,
  PairBodySchema,
  MAX_BODY_BYTES,
  PROTOCOL_VERSION,
  AiStreamBodySchema,
  AiResumeBodySchema,
  ResourceSearchBodySchema,
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

function rawRequest({ port, path = '/v1/health', headers = {} }) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'GET',
        headers,
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('browser extension protocol', () => {
  it('allows only extension origins', () => {
    for (const origin of [
      'chrome-extension://abcd',
      'moz-extension://abcd',
      'safari-web-extension://abcd',
    ]) {
      assert.equal(isAllowedExtensionOrigin(origin), true);
      assert.equal(corsHeaders(origin)['Access-Control-Allow-Origin'], origin);
    }
    assert.equal(isAllowedExtensionOrigin('null'), false);
    assert.equal(isAllowedExtensionOrigin(''), false);
    assert.equal(isAllowedExtensionOrigin('https://evil.example'), false);
    assert.equal(corsHeaders('https://evil.example')['Access-Control-Allow-Origin'], undefined);
    assert.equal(
      requestOrigin({ origin: 'chrome-extension://abcd' }),
      'chrome-extension://abcd',
    );
    assert.equal(
      requestOrigin({ [EXTENSION_ORIGIN_HEADER]: 'chrome-extension://sw' }),
      'chrome-extension://sw',
    );
    assert.equal(
      requestOrigin({
        origin: 'null',
        [EXTENSION_ORIGIN_HEADER]: 'chrome-extension://sw',
      }),
      'chrome-extension://sw',
    );
    assert.equal(
      requestOrigin({
        origin: 'https://evil.example',
        [EXTENSION_ORIGIN_HEADER]: 'chrome-extension://sw',
      }),
      'https://evil.example',
    );
    assert.equal(
      corsHeaders('chrome-extension://abcd')['Access-Control-Allow-Headers'],
      `Content-Type, Authorization, ${EXTENSION_ORIGIN_HEADER}`,
    );
  });

  it('rejects tiny pairing payloads', () => {
    assert.equal(PairBodySchema.safeParse({ code: 'ab' }).success, false);
    assert.equal(PairBodySchema.safeParse({ code: 'ABCD2345' }).success, true);
    assert.ok(MAX_BODY_BYTES < 2_000_000);
  });

  it('uses strict v2 schemas and bounded image attachments', () => {
    assert.equal(PROTOCOL_VERSION, 2);
    assert.equal(
      AiStreamBodySchema.safeParse({
        action: 'ask',
        prompt: 'Describe la captura',
        model: 'gpt-test',
        toolsEnabled: true,
        resourceToolsEnabled: false,
        memoryEnabled: false,
        projectId: 'default',
        attachments: {
          images: [{ dataUrl: 'data:image/png;base64,aGVsbG8=' }],
        },
      }).success,
      true,
    );
    assert.equal(
      AiStreamBodySchema.safeParse({
        action: 'ask',
        text: 'x',
        unexpected: true,
      }).success,
      false,
    );
    assert.equal(
      AiStreamBodySchema.safeParse({
        action: 'ask',
        text: 'x',
        provider: 'openai',
      }).success,
      false,
    );
    assert.equal(
      AiResumeBodySchema.safeParse({
        streamId: 'stream-1',
        decision: { type: 'approve' },
      }).success,
      true,
    );
    assert.equal(
      ResourceSearchBodySchema.safeParse({ query: 'dome', limit: 31 }).success,
      false,
    );
  });
});

describe('browser extension pairing', () => {
  it('stores only token hashes and can revoke clients', () => {
    const queries = memoryQueries();
    const pairing = createPairing({ getQueries: () => queries });
    const started = pairing.startPairing();
    const origin = 'chrome-extension://dome-test';
    const paired = pairing.pair({ code: started.code, clientName: 'Chrome' }, origin);
    assert.match(paired.token, /^dxt_[0-9a-f]+$/);
    assert.equal(pairing.resolveToken(paired.token, origin)?.id, paired.clientId);
    assert.equal(pairing.resolveToken(paired.token, 'moz-extension://dome-test'), null);
    const stored = JSON.parse(queries.getSetting.get('browser_extension_clients').value);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].tokenHash, sha256(paired.token));
    assert.equal(stored[0].origin, origin);
    assert.equal(JSON.stringify(stored).includes(paired.token), false);
    const listed = pairing.listClients();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].name, 'Chrome');
    pairing.revoke(paired.clientId);
    assert.equal(pairing.resolveToken(paired.token, origin), null);
  });

  it('rejects invalid and expired codes', () => {
    const pairing = createPairing({ getQueries: () => memoryQueries() });
    const origin = 'chrome-extension://dome-test';
    assert.throws(() => pairing.pair({ code: 'NOPE1234' }, origin), /No pairing code/);
    const queries = memoryQueries();
    const live = createPairing({ getQueries: () => queries });
    const started = live.startPairing();
    assert.throws(() => live.pair({ code: 'ZZZZZZZZ' }, origin), /Invalid pairing code/);
    assert.equal(sha256('a').length, 64);
    live.cancelPairing();
    assert.throws(() => live.pair({ code: started.code }, origin), /No pairing code/);
  });

  it('binds chrome, firefox and safari clients to their exact origin', () => {
    for (const origin of [
      'chrome-extension://chrome-id',
      'moz-extension://firefox-id',
      'safari-web-extension://com.dome.extension',
    ]) {
      const queries = memoryQueries();
      const pairing = createPairing({ getQueries: () => queries });
      const started = pairing.startPairing();
      const paired = pairing.pair({ code: started.code }, origin);
      assert.ok(pairing.resolveToken(paired.token, origin));
      assert.equal(pairing.resolveToken(paired.token, `${origin}/`), null);
    }
  });

  it('rejects legacy clients without an origin', () => {
    const queries = memoryQueries();
    const token = 'dxt_legacy';
    queries.setSetting.run(
      'browser_extension_clients',
      JSON.stringify([{ id: 'legacy', name: 'Old', tokenHash: sha256(token) }]),
    );
    const pairing = createPairing({ getQueries: () => queries });
    assert.equal(pairing.resolveToken(token, 'chrome-extension://dome-test'), null);
    assert.equal(pairing.resolveToken(token, ''), null);
  });

  it('authenticates a paired token on loopback when Origin is omitted', () => {
    const queries = memoryQueries();
    const pairing = createPairing({ getQueries: () => queries });
    const started = pairing.startPairing();
    const origin = 'chrome-extension://abcd';
    const paired = pairing.pair({ code: started.code, clientName: 'SW' }, origin);
    assert.ok(pairing.resolveToken(paired.token, origin));
    assert.ok(pairing.resolveToken(paired.token, ''));
    assert.equal(pairing.resolveToken(paired.token, 'chrome-extension://other'), null);
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
      getNativeToolDefinitions: () => [],
      resolveProviderConfig: async () => ({ provider: 'openai', model: 'gpt', apiKey: 'k', baseUrl: undefined }),
      runManyAgent: async ({ onChunk }) => {
        onChunk?.({ type: 'text', text: 'Hello from Many' });
        onChunk?.({ type: 'thinking', text: 'Checking sources' });
        onChunk?.({
          type: 'tool_call',
          toolCall: { id: 'tool-1', name: 'resource_search', arguments: '{}' },
        });
        onChunk?.({
          type: 'usage',
          usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
        });
        onChunk?.({
          type: 'compaction',
          tokensBefore: 100,
          tokensAfter: 40,
          summaryPreview: 'Earlier context',
        });
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

    const wrongExtension = await fetch(`http://127.0.0.1:${port}/v1/context`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'moz-extension://different-client',
      },
    });
    assert.equal(wrongExtension.status, 401);

    const nullOrigin = await fetch(`http://127.0.0.1:${port}/v1/context`, {
      headers: { Authorization: `Bearer ${token}`, Origin: 'null' },
    });
    assert.equal(nullOrigin.status, 200);

    const missingOrigin = await fetch(`http://127.0.0.1:${port}/v1/context`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(missingOrigin.status, 200);

    const serviceWorkerOrigin = await fetch(`http://127.0.0.1:${port}/v1/context`, {
      headers: {
        Authorization: `Bearer ${token}`,
        [EXTENSION_ORIGIN_HEADER]: origin,
      },
    });
    assert.equal(serviceWorkerOrigin.status, 200);

    const nullOriginWithHeader = await fetch(`http://127.0.0.1:${port}/v1/context`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'null',
        [EXTENSION_ORIGIN_HEADER]: origin,
      },
    });
    assert.equal(nullOriginWithHeader.status, 200);

    const spoofedHeader = await fetch(`http://127.0.0.1:${port}/v1/context`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'https://evil.example',
        [EXTENSION_ORIGIN_HEADER]: origin,
      },
    });
    assert.equal(spoofedHeader.status, 403);

    const wrongHost = await rawRequest({
      port,
      headers: { Host: `localhost:${port}`, Origin: origin },
    });
    assert.equal(wrongHost, 403);

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
    assert.match(sse, /"event":"text"/);
    assert.match(sse, /"type":"reasoning"/);
    assert.match(sse, /"type":"tool_call"/);
    assert.match(sse, /"type":"usage"/);
    assert.match(sse, /"type":"compaction"/);
    assert.equal((sse.match(/"type":"done"/g) || []).length, 1);
  });

  it('serves bootstrap, resources, session mutations and approval resume endpoints', async () => {
    const queries = memoryQueries();
    const pairing = createPairing({ getQueries: () => queries });
    const started = pairing.startPairing();
    const calls = [];
    const many = {
      bootstrap: async () => ({ config: { provider: 'test', model: 'm1' } }),
      getModelsCatalog: async () => ({
        provider: 'configured-provider',
        models: [{ id: 'configured-model', name: 'Configured model' }],
      }),
      searchResources: async (body) => ({ results: [{ id: 'r1', query: body.query }] }),
      hydrateResources: async (body) => ({ resources: body.ids.map((id) => ({ id, found: true })) }),
      deleteSession: async (id) => ({ id, deleted: true }),
      pinSession: async (id, pinned) => ({ id, pinned }),
      approval: (streamId, clientId) => ({ streamId, clientId, actionRequests: [{ name: 'shell_exec' }] }),
      resume: async ({ streamId, clientId, decision, onChunk }) => {
        calls.push({ streamId, clientId, decision });
        onChunk({ type: 'thinking', text: 'Resuming' });
        onChunk({ type: 'tool_result', toolCallId: 't1', result: 'ok', isError: false });
        onChunk({ type: 'done' });
        return { result: 'ok' };
      },
      cancel: () => ({ cancelled: false }),
    };
    const capture = {
      context: () => ({ projectId: 'default', projectName: 'Default', projects: [] }),
    };
    server = createServer({ pairing, capture, many, port: 0 });
    const listen = await server.listen();
    const origin = 'chrome-extension://dome-v2';
    const pairRes = await fetch(`http://127.0.0.1:${listen.port}/v1/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ code: started.code, clientName: 'V2' }),
    });
    const token = (await pairRes.json()).data.token;
    const headers = {
      Authorization: `Bearer ${token}`,
      Origin: origin,
      'Content-Type': 'application/json',
    };

    const bootstrap = await fetch(`http://127.0.0.1:${listen.port}/v1/bootstrap`, { headers });
    const bootstrapBody = await bootstrap.json();
    assert.equal(bootstrapBody.data.config.provider, 'test');
    assert.equal(bootstrapBody.data.context.projectName, 'Default');
    const arbitraryProvider = await fetch(
      `http://127.0.0.1:${listen.port}/v1/models?provider=openai`,
      { headers },
    );
    assert.equal(arbitraryProvider.status, 400);
    const configuredModels = await fetch(
      `http://127.0.0.1:${listen.port}/v1/models`,
      { headers },
    );
    const configuredModelsBody = await configuredModels.json();
    assert.equal(configuredModels.status, 200);
    assert.equal(configuredModelsBody.data.provider, 'configured-provider');
    assert.equal(configuredModelsBody.data.models[0].id, 'configured-model');

    const invalidSearch = await fetch(`http://127.0.0.1:${listen.port}/v1/resources/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: 'dome', unknown: true }),
    });
    assert.equal(invalidSearch.status, 400);
    const search = await fetch(`http://127.0.0.1:${listen.port}/v1/resources/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: 'dome', limit: 5 }),
    });
    assert.equal((await search.json()).data.results[0].id, 'r1');

    const pin = await fetch(`http://127.0.0.1:${listen.port}/v1/ai/sessions/session-1/pin`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ pinned: true }),
    });
    assert.equal((await pin.json()).data.pinned, true);
    const removed = await fetch(`http://127.0.0.1:${listen.port}/v1/ai/sessions/session-1`, {
      method: 'DELETE',
      headers,
    });
    assert.equal((await removed.json()).data.deleted, true);

    const pending = await fetch(`http://127.0.0.1:${listen.port}/v1/ai/approvals/stream-1`, { headers });
    assert.equal((await pending.json()).data.actionRequests[0].name, 'shell_exec');
    const resumed = await fetch(`http://127.0.0.1:${listen.port}/v1/ai/resume`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ streamId: 'stream-1', decision: { type: 'approve' } }),
    });
    const resumedSse = await resumed.text();
    assert.match(resumedSse, /"type":"reasoning"/);
    assert.match(resumedSse, /"type":"tool_result"/);
    assert.equal((resumedSse.match(/"type":"done"/g) || []).length, 1);
    assert.deepEqual(calls[0].decision, { type: 'approve' });
  });
});

describe('Many browser sessions', () => {
  function service(runManyAgent = async () => ({})) {
    const metas = [{ id: 'desktop-session', updatedAt: 2 }, { id: 'canvas-hidden', updatedAt: 1 }];
    const repo = { list: async () => metas, open: async () => ({ buildContext: async () => ({ messages: [{ role: 'user', content: 'Earlier question' }, { role: 'assistant', content: [{ type: 'text', text: 'Earlier answer' }, { type: 'thinking', thinking: 'Private reasoning' }] }] }) }) };
    return createManyService({ getDatabase: () => ({}), getNativeToolDefinitions: () => [], resolveProviderConfig: async () => ({ provider: 'test', model: 'test' }), runManyAgent,
      getBridge: () => ({ SESSION_CWD: 'dome', getSessionRepo: async () => repo, findSessionMetadata: async id => metas.find(meta => meta.id === id), isRootSessionMeta: meta => !meta.id.startsWith('canvas-') }),
    });
  }
  it('lists root conversations and exposes only user-facing text', async () => {
    const many = service();
    assert.deepEqual((await many.listSessions()).sessions.map(s => s.id), ['desktop-session']);
    const state = await many.readSession('desktop-session');
    assert.equal(state.messages[1].text, 'Earlier answer');
    assert.equal(state.messages[1].reasoning, 'Private reasoning');
    await assert.rejects(many.readSession('canvas-hidden'), /not available/);
  });

  it('reconstructs reasoning, bounded images and associated tool results safely', async () => {
    const messages = [
      {
        role: 'user',
        timestamp: 10,
        content: [
          { type: 'text', text: 'Inspect this image' },
          { type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' },
          { type: 'image', data: 'd29ybGQ=', mimeType: 'image/jpeg' },
          { type: 'image', data: 'dGhpcmQ=', mimeType: 'image/webp' },
          { type: 'image', data: '/Users/max/private.png', mimeType: 'image/png' },
        ],
      },
      {
        role: 'assistant',
        timestamp: 20,
        content: [
          { type: 'text', text: 'I checked it.' },
          { type: 'thinking', thinking: 'Compared the visible details.' },
          {
            type: 'toolCall',
            id: 'tool-success',
            name: 'resource_get',
            arguments: {
              resourceId: 'r1',
              path: '/Users/max/private.txt',
              apiKey: 'sk-secretvalue',
            },
          },
          {
            type: 'toolCall',
            id: 'tool-error',
            name: 'resource_search',
            arguments: { query: 'safe query' },
          },
        ],
      },
      {
        role: 'toolResult',
        toolCallId: 'tool-success',
        toolName: 'resource_get',
        details: {
          ok: true,
          content: 'found',
          path: '/private/tmp/output.txt',
          token: 'token_secretvalue',
        },
      },
      {
        role: 'toolResult',
        toolCallId: 'tool-error',
        toolName: 'resource_search',
        isError: true,
        content: [{
          type: 'text',
          text: 'Failed at /Users/max/private.txt with Bearer abcdef123456',
        }],
      },
      {
        role: 'toolResult',
        toolCallId: 'orphan',
        toolName: 'legacy_tool',
        content: [{ type: 'text', text: '{"ok":true}' }],
      },
    ];
    const meta = { id: 'rich-session', createdAt: 1, updatedAt: 2 };
    const repo = {
      list: async () => [meta],
      open: async () => ({ buildContext: async () => ({ messages }) }),
    };
    const many = createManyService({
      getDatabase: () => ({}),
      getBridge: () => ({
        SESSION_CWD: 'dome',
        getSessionRepo: async () => repo,
        findSessionMetadata: async (id) => id === meta.id ? meta : null,
        isRootSessionMeta: () => true,
      }),
    });

    const state = await many.readSession(meta.id);
    assert.equal(state.messages.length, 3);
    assert.equal(state.messages[0].attachments.images.length, 2);
    assert.match(state.messages[0].attachments.images[0].dataUrl, /^data:image\/png;base64,/);
    const assistant = state.messages[1];
    assert.equal(assistant.reasoning, 'Compared the visible details.');
    assert.equal(assistant.toolCalls[0].status, 'success');
    assert.deepEqual(assistant.toolCalls[0].result, {
      ok: true,
      content: 'found',
      path: '[redacted]',
      token: '[redacted]',
    });
    assert.equal(assistant.toolCalls[0].arguments.path, '[redacted]');
    assert.equal(assistant.toolCalls[0].arguments.apiKey, '[redacted]');
    assert.equal(assistant.toolCalls[1].status, 'error');
    assert.match(assistant.toolCalls[1].error, /redacted/);
    assert.equal(state.messages[2].role, 'toolResult');
    assert.equal(state.messages[2].status, 'success');
    assert.deepEqual(state.messages[2].result, { ok: true });
    const serialized = JSON.stringify(state);
    assert.equal(serialized.includes('/Users/'), false);
    assert.equal(serialized.includes('/private/tmp/'), false);
    assert.equal(serialized.includes('sk-secretvalue'), false);
    assert.equal(serialized.includes('token_secretvalue'), false);
    assert.equal(serialized.includes('abcdef123456'), false);
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

  it('pins and deletes root conversations through the session repository', async () => {
    const queries = memoryQueries();
    const database = { getQueries: () => queries };
    const metas = [{ id: 'root-session', createdAt: 1, updatedAt: 2 }];
    let deleted = null;
    const repo = {
      list: async () => metas,
      open: async () => ({
        buildContext: async () => ({
          messages: [{ role: 'user', content: 'Pinned conversation' }],
        }),
      }),
      delete: async (meta) => {
        deleted = meta.id;
        metas.splice(0, metas.length);
      },
    };
    const bridge = {
      SESSION_CWD: 'dome',
      getSessionRepo: async () => repo,
      findSessionMetadata: async (id) => metas.find((meta) => meta.id === id),
      isRootSessionMeta: () => true,
    };
    const many = createManyService({
      getDatabase: () => database,
      getBridge: () => bridge,
      resolveProviderConfig: async () => ({ provider: 'test', model: 'test' }),
      runManyAgent: async () => ({}),
    });

    assert.deepEqual(await many.pinSession('root-session', true), {
      id: 'root-session',
      pinned: true,
    });
    assert.equal((await many.listSessions()).sessions[0].pinned, true);
    assert.deepEqual(await many.deleteSession('root-session'), {
      deleted: true,
      id: 'root-session',
    });
    assert.equal(deleted, 'root-session');
    assert.deepEqual(JSON.parse(queries.getSetting.get('browser_extension_pinned_sessions').value), []);
  });
});

describe('Many browser runtime parity', () => {
  function hitlService({
    approvalTtlMs,
    runManyAgent,
    resumeManyAgent = async () => 'done',
  }) {
    return createManyService({
      approvalTtlMs,
      getDatabase: () => ({}),
      resolveProviderConfig: async () => ({
        provider: 'test',
        model: 'test-model',
      }),
      getBridge: () => ({
        findSessionMetadata: async () => null,
        isRootSessionMeta: () => true,
      }),
      getNativeToolDefinitions: () => [],
      loadMemoryContext: () => ({ soul: 'Many', volatileMemory: '' }),
      buildSystemPrompt: ({ staticPersona, volatileContext }) =>
        `${staticPersona}\n${volatileContext}`,
      runManyAgent,
      resumeManyAgent,
    });
  }

  function interruptResult(threadId) {
    return {
      __interrupt__: true,
      threadId,
      actionRequests: [{ name: 'shell_exec', args: {} }],
      reviewConfigs: [{
        actionName: 'shell_exec',
        allowedDecisions: ['approve', 'reject'],
      }],
      pendingToolCall: {
        id: 'pending-tool',
        name: 'shell_exec',
        arguments: {},
      },
    };
  }

  it('validates model selection and preserves effective tools and memory through resume', async () => {
    const runs = [];
    const resumes = [];
    const resolved = [];
    const memoryLoads = [];
    const promptBuilds = [];
    const definitions = [
      { type: 'function', function: { name: 'resource_search', parameters: {} } },
      { type: 'function', function: { name: 'remember_fact', parameters: {} } },
      { type: 'function', function: { name: 'web_search', parameters: {} } },
    ];
    const interruptFor = (options) => ({
      __interrupt__: true,
      threadId: options.threadId,
      actionRequests: [{ name: 'web_search', args: {} }],
      reviewConfigs: [{ actionName: 'web_search', allowedDecisions: ['approve', 'reject'] }],
      pendingToolCall: { id: `tool-${runs.length}`, name: 'web_search', arguments: {} },
    });
    const many = createManyService({
      getDatabase: () => ({ marker: 'database' }),
      getAiSettings: async () => ({
        provider: 'openai',
        model: 'model-1',
        apiKey: 'secret',
        baseUrl: 'https://configured.example',
      }),
      fetchProviderModels: async (provider) => ({
        success: true,
        models: [
          { id: 'model-1', name: `${provider} one` },
          { id: 'model-2', name: `${provider} two` },
        ],
      }),
      resolveProviderConfig: async (_database, provider, model) => {
        resolved.push({ provider, model });
        return {
          provider: provider || 'openai',
          model: model || 'model-1',
          apiKey: 'secret',
          baseUrl: 'https://configured.example',
        };
      },
      getNativeToolDefinitions: () => definitions,
      loadMemoryContext: (options) => {
        memoryLoads.push(options);
        return {
          soul: 'SOUL persona',
          volatileMemory: options.memoryEnabled ? 'PROJECT MEMORY' : '',
        };
      },
      getManyRolePrompt: () => 'roleMany fallback',
      buildSystemPrompt: (options) => {
        promptBuilds.push(options);
        return [options.staticPersona, options.volatileContext].filter(Boolean).join('\n');
      },
      runManyAgent: async (options) => {
        runs.push(options);
        return interruptFor(options);
      },
      resumeManyAgent: async (options) => {
        resumes.push(options);
        return 'done';
      },
    });

    await many.stream({
      action: 'ask',
      prompt: 'No resources or memory',
      streamId: 'configured-one',
      clientId: 'client',
      model: 'model-2',
      toolsEnabled: true,
      resourceToolsEnabled: false,
      memoryEnabled: false,
      projectId: 'project-1',
      mcpServerIds: ['GitHub'],
    });
    assert.deepEqual(resolved[0], { provider: 'openai', model: 'model-2' });
    assert.deepEqual(runs[0].toolIds, ['web_search']);
    assert.deepEqual(runs[0].mcpServerIds, ['GitHub']);
    assert.equal(runs[0].userMemory, undefined);
    assert.equal(runs[0].messages[0].content.includes('SOUL persona'), true);
    assert.equal(runs[0].messages[0].content.includes('PROJECT MEMORY'), false);
    assert.equal(runs[0].messages[0].content.includes('untrusted source data'), true);
    assert.equal(runs[0].messages[0].content.includes('browser_read_page before answering'), true);
    assert.deepEqual(memoryLoads[0], {
      memoryEnabled: false,
      projectId: 'project-1',
      includeProject: true,
    });
    assert.equal(promptBuilds[0].omitCoreTools, false);

    await many.resume({
      streamId: 'configured-one',
      clientId: 'client',
      decision: { type: 'approve' },
    });
    assert.deepEqual(resumes[0].toolIds, ['web_search']);
    assert.deepEqual(resumes[0].mcpServerIds, ['GitHub']);
    assert.equal(resumes[0].messages[0].role, 'system');
    assert.equal(resumes[0].userMemory, undefined);

    await many.stream({
      action: 'ask',
      prompt: 'Memory without tools',
      streamId: 'configured-two',
      clientId: 'client',
      toolsEnabled: false,
      resourceToolsEnabled: true,
      memoryEnabled: true,
      projectId: 'project-2',
      mcpServerIds: ['GitHub'],
    });
    assert.deepEqual(runs[1].toolDefinitions, []);
    assert.deepEqual(runs[1].toolIds, []);
    assert.deepEqual(runs[1].mcpServerIds, []);
    assert.equal(runs[1].userMemory, 'PROJECT MEMORY');
    assert.equal(runs[1].messages[0].content.includes('PROJECT MEMORY'), true);
    assert.equal(promptBuilds[1].omitCoreTools, true);
    await many.resume({
      streamId: 'configured-two',
      clientId: 'client',
      decision: { type: 'reject' },
    });
    assert.deepEqual(resumes[1].toolDefinitions, []);
    assert.deepEqual(resumes[1].mcpServerIds, []);
    assert.equal(resumes[1].userMemory, 'PROJECT MEMORY');

    await many.stream({
      action: 'ask',
      prompt: 'All capabilities',
      streamId: 'configured-three',
      clientId: 'client',
      toolsEnabled: true,
      resourceToolsEnabled: true,
      memoryEnabled: true,
    });
    assert.deepEqual(runs[2].toolIds, [
      'resource_search',
      'remember_fact',
      'web_search',
    ]);
    await many.resume({
      streamId: 'configured-three',
      clientId: 'client',
      decision: { type: 'approve' },
    });
    assert.deepEqual(resumes[2].toolIds, runs[2].toolIds);

    await assert.rejects(
      many.stream({
        action: 'ask',
        prompt: 'Invalid model',
        streamId: 'configured-invalid',
        clientId: 'client',
        model: 'attacker/model',
      }),
      /not available for the configured provider/,
    );
    assert.equal(runs.length, 3);
  });

  it('passes bounded attachments, MCP and pins into HITL runs and resumes approvals', async () => {
    const runCalls = [];
    const resumeCalls = [];
    const many = createManyService({
      getDatabase: () => ({}),
      getNativeToolDefinitions: () => [],
      resolveProviderConfig: async () => ({
        provider: 'openai',
        model: 'gpt-test',
        apiKey: 'secret',
      }),
      runManyAgent: async (options) => {
        runCalls.push(options);
        options.onChunk?.({
          type: 'interrupt',
          threadId: options.threadId,
          actionRequests: [{ name: 'resource_delete', args: { id: 'r1' } }],
          reviewConfigs: [{ actionName: 'resource_delete', allowedDecisions: ['approve', 'reject'] }],
          pendingToolCall: { id: 'tool-1', name: 'resource_delete', arguments: { id: 'r1' } },
        });
        return {
          __interrupt__: true,
          threadId: options.threadId,
          actionRequests: [{ name: 'resource_delete', args: { id: 'r1' } }],
          reviewConfigs: [{ actionName: 'resource_delete', allowedDecisions: ['approve', 'reject'] }],
          pendingToolCall: { id: 'tool-1', name: 'resource_delete', arguments: { id: 'r1' } },
        };
      },
      resumeManyAgent: async (options) => {
        resumeCalls.push(options);
        options.onChunk?.({ type: 'text', text: 'Approved' });
        options.onChunk?.({ type: 'done' });
        return 'Approved';
      },
    });
    const chunks = [];
    await many.stream({
      action: 'ask',
      text: '',
      prompt: 'Delete it',
      streamId: 'hitl-stream',
      clientId: 'client-a',
      mcpServerIds: ['GitHub'],
      thinkingLevel: 'high',
      pinnedResources: [{ id: 'r1', title: 'Readable title', kind: 'note' }],
      attachments: {
        images: [{ dataUrl: 'data:image/png;base64,aGVsbG8=' }],
      },
      onChunk: (chunk) => chunks.push(chunk),
    });

    assert.equal(runCalls[0].skipHitl, false);
    assert.equal(runCalls[0].hitlInterrupt, true);
    assert.deepEqual(runCalls[0].mcpServerIds, ['GitHub']);
    assert.deepEqual(runCalls[0].runtimeContext, { pinnedResourceIds: ['r1'] });
    assert.equal(runCalls[0].messages[1].attachments.images.length, 1);
    assert.equal(many.approval('hitl-stream', 'client-a').actionRequests[0].name, 'resource_delete');
    assert.throws(() => many.approval('hitl-stream', 'client-b'), /not available/);
    assert.deepEqual(many.cancel('hitl-stream', 'client-b'), { cancelled: false });
    assert.equal(many.approval('hitl-stream', 'client-a').threadId, 'browser-extension:hitl-stream');

    await many.resume({
      streamId: 'hitl-stream',
      clientId: 'client-a',
      decision: { type: 'approve' },
      onChunk: (chunk) => chunks.push(chunk),
    });
    assert.deepEqual(resumeCalls[0].decisions, [{ type: 'approve' }]);
    assert.deepEqual(resumeCalls[0].runtimeContext, { pinnedResourceIds: ['r1'] });
    assert.throws(() => many.approval('hitl-stream', 'client-a'), /not available/);
    assert.ok(chunks.some((chunk) => chunk.type === 'text' && chunk.text === 'Approved'));
  });

  it('reserves a pending thread and releases it on cancel and completed runs', async () => {
    let runCount = 0;
    const many = hitlService({
      runManyAgent: async ({ threadId }) => {
        runCount += 1;
        return runCount === 1 ? interruptResult(threadId) : 'done';
      },
    });
    const threadId = 'browser-extension:pending-thread';
    await many.stream({
      action: 'ask',
      prompt: 'First',
      threadId,
      streamId: 'pending-one',
      clientId: 'client',
    });
    await assert.rejects(
      many.stream({
        action: 'ask',
        prompt: 'Blocked',
        threadId,
        streamId: 'pending-two',
        clientId: 'client',
      }),
      /already responding/,
    );
    assert.deepEqual(many.cancel('pending-one', 'client'), { cancelled: true });
    await many.stream({
      action: 'ask',
      prompt: 'After cancel',
      threadId,
      streamId: 'pending-three',
      clientId: 'client',
    });
    await many.stream({
      action: 'ask',
      prompt: 'After done',
      threadId,
      streamId: 'pending-four',
      clientId: 'client',
    });
    assert.equal(runCount, 3);
  });

  it('keeps approval retryable after resume failure and blocks concurrent resumes', async () => {
    let resumeCount = 0;
    let finishResume;
    const many = hitlService({
      runManyAgent: async ({ threadId }) => interruptResult(threadId),
      resumeManyAgent: async () => {
        resumeCount += 1;
        if (resumeCount === 1) throw new Error('temporary provider failure');
        if (resumeCount === 2) {
          return new Promise((resolve) => {
            finishResume = resolve;
          });
        }
        return 'unexpected';
      },
    });
    await many.stream({
      action: 'ask',
      prompt: 'Needs approval',
      streamId: 'retry-resume',
      clientId: 'client',
    });
    await assert.rejects(
      many.resume({
        streamId: 'retry-resume',
        clientId: 'client',
        decision: { type: 'approve' },
      }),
      /temporary provider failure/,
    );
    assert.ok(many.approval('retry-resume', 'client').expiresAt > Date.now());
    const activeResume = many.resume({
      streamId: 'retry-resume',
      clientId: 'client',
      decision: { type: 'approve' },
    });
    await assert.rejects(
      many.resume({
        streamId: 'retry-resume',
        clientId: 'client',
        decision: { type: 'approve' },
      }),
      /already being resumed/,
    );
    finishResume('done');
    await activeResume;
    assert.throws(() => many.approval('retry-resume', 'client'), /not available/);
  });

  it('expires pending approvals and releases their conversation', async () => {
    let runCount = 0;
    const many = hitlService({
      approvalTtlMs: 10,
      runManyAgent: async ({ threadId }) => {
        runCount += 1;
        return runCount === 1 ? interruptResult(threadId) : 'done';
      },
    });
    const threadId = 'browser-extension:expiring-thread';
    await many.stream({
      action: 'ask',
      prompt: 'Wait',
      threadId,
      streamId: 'expiring-one',
      clientId: 'client',
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.throws(() => many.approval('expiring-one', 'client'), /not available/);
    await many.stream({
      action: 'ask',
      prompt: 'After timeout',
      threadId,
      streamId: 'expiring-two',
      clientId: 'client',
    });
    assert.equal(runCount, 2);
  });

  it('releases the conversation when an active resume is cancelled', async () => {
    let runCount = 0;
    const many = hitlService({
      runManyAgent: async ({ threadId }) => {
        runCount += 1;
        return runCount === 1 ? interruptResult(threadId) : 'done';
      },
      resumeManyAgent: async ({ signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new Error('resume cancelled')),
            { once: true },
          );
        }),
    });
    const threadId = 'browser-extension:cancel-resume-thread';
    await many.stream({
      action: 'ask',
      prompt: 'Needs approval',
      threadId,
      streamId: 'cancel-resume',
      clientId: 'client',
    });
    const resuming = many.resume({
      streamId: 'cancel-resume',
      clientId: 'client',
      decision: { type: 'approve' },
    });
    assert.deepEqual(many.cancel('cancel-resume', 'client'), { cancelled: true });
    await assert.rejects(resuming, /resume cancelled/);
    await many.stream({
      action: 'ask',
      prompt: 'After cancelled resume',
      threadId,
      streamId: 'after-cancelled-resume',
      clientId: 'client',
    });
    assert.equal(runCount, 2);
  });

  it('reuses skills, MCP, model and resource services without exposing secrets', async () => {
    const searches = [];
    const gets = [];
    const modelProviders = [];
    const queries = {
      getMcpGlobalSettings: { get: () => ({ enabled: 1 }) },
      listMcpServers: {
        all: () => [{
          id: 'mcp-1',
          name: 'GitHub',
          type: 'http',
          enabled: 1,
          url: 'https://secret.example',
          headers_json: '{"Authorization":"secret"}',
          tools_json: '[{"name":"search_issues"}]',
          last_discovery_at: 4,
          last_discovery_error: null,
        }],
      },
    };
    const many = createManyService({
      getDatabase: () => ({ getQueries: () => queries }),
      getAiSettings: async () => ({
        provider: 'openai',
        model: 'gpt-test',
        apiKey: 'secret',
        baseUrl: 'https://api.example',
      }),
      listSkills: async () => [{
        name: 'Research',
        description: 'Search carefully',
        path: '/private/skill.md',
      }],
      fetchProviderModels: async (provider) => {
        modelProviders.push(provider);
        return {
          success: true,
          models: [{ id: 'gpt-test', name: 'GPT Test', reasoning: true, input: ['text', 'image'] }],
        };
      },
      getAiTools: () => ({
        resourceHybridSearch: async (query, options) => {
          searches.push({ query, options });
          return { success: true, results: [{ id: 'r1', title: 'Result' }] };
        },
        resourceGet: async (id, options) => {
          gets.push({ id, options });
          return { success: true, resource: { id, title: 'Hydrated', content: 'Body' } };
        },
      }),
    });

    const skills = await many.getSkillsCatalog();
    assert.deepEqual(skills.skills, [{ name: 'Research', description: 'Search carefully' }]);
    const mcp = await many.getMcpCatalog();
    assert.equal(mcp.servers[0].selectionId, 'GitHub');
    assert.deepEqual(mcp.servers[0].tools, ['search_issues']);
    assert.equal(JSON.stringify(mcp).includes('secret'), false);
    const models = await many.getModelsCatalog();
    assert.equal(models.models[0].id, 'gpt-test');
    assert.deepEqual(modelProviders, ['openai']);
    assert.equal(JSON.stringify(models).includes('api.example'), false);

    const search = await many.searchResources({
      query: 'knowledge',
      projectId: 'default',
      limit: 5,
      semanticMinScore: 0.4,
    });
    assert.equal(search.results[0].title, 'Result');
    assert.equal(searches[0].options.project_id, 'default');
    const hydrated = await many.hydrateResources({
      ids: ['r1'],
      includeContent: true,
      maxContentChars: 1234,
    });
    assert.equal(hydrated.resources[0].resource.content, 'Body');
    assert.equal(gets[0].options.maxContentLength, 1234);
  });
});

it('executes browser tools through authenticated request/result round trips', async () => {
  let many;
  const results = [];
  many = createManyService({ getDatabase: () => ({}), getNativeToolDefinitions: () => [], resolveProviderConfig: async () => ({ provider: 'test', model: 'test' }),
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
