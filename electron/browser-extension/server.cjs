'use strict';

const http = require('node:http');
const { URL } = require('node:url');
const {
  DEFAULT_PORT,
  HOST,
  MAX_BODY_BYTES,
  PROTOCOL_VERSION,
  PairBodySchema,
  CreateNoteBodySchema,
  UpdateNoteBodySchema,
  AppendNoteBodySchema,
  ContactBodySchema,
  CaptureUrlBodySchema,
  AiStreamBodySchema,
  AiCancelBodySchema,
  AiToolResultBodySchema,
  AiResumeBodySchema,
  SessionPinBodySchema,
  ResourceSearchBodySchema,
  ResourceHydrateBodySchema,
  ModelsQuerySchema,
  isAllowedExtensionOrigin,
  requestOrigin,
  corsHeaders,
} = require('./protocol.cjs');

function json(res, status, body, origin) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(origin),
  };
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        reject(
          Object.assign(new Error('Payload too large'), { statusCode: 413 }),
        );
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(
          Object.assign(new Error('Invalid JSON body'), { statusCode: 400 }),
        );
      }
    });
    req.on('error', reject);
  });
}

function bearerToken(req) {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(\S+)/i.exec(header);
  return match ? match[1] : null;
}

function createRateLimiter({ windowMs, max }) {
  const hits = new Map();
  return {
    take(key) {
      const now = Date.now();
      const row = hits.get(key);
      if (!row || now >= row.resetAt) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      if (row.count >= max) return false;
      row.count += 1;
      return true;
    },
  };
}

function writeSse(res, payload) {
  if (res.writableEnded || res.destroyed) return;
  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized, 'utf8') > 250_000) {
    res.write(
      `data: ${JSON.stringify({
        type: 'error',
        error: 'Stream event exceeded the bridge size limit',
      })}\n\n`,
    );
    return;
  }
  res.write(`data: ${serialized}\n\n`);
}

function relayStreamChunk(send, chunk) {
  if (!chunk || typeof chunk !== 'object') return false;
  switch (chunk.type) {
    case 'text':
      if (chunk.text) send({ type: 'delta', event: 'text', text: chunk.text });
      return false;
    case 'thinking':
      if (chunk.text) send({ type: 'reasoning', text: chunk.text });
      return false;
    case 'interrupt':
      send({
        type: 'approval',
        threadId: chunk.threadId,
        actionRequests: chunk.actionRequests || [],
        reviewConfigs: chunk.reviewConfigs || [],
      });
      return false;
    case 'done':
      send({ type: 'done' });
      return true;
    case 'error':
      send({ type: 'error', error: chunk.error || 'AI error' });
      return false;
    case 'browser_tool':
    case 'tool_call':
    case 'tool_progress':
    case 'tool_result':
    case 'usage':
    case 'compaction':
    case 'budget':
    case 'harness':
      send(chunk);
      return false;
    default:
      return false;
  }
}

function createServer({ pairing, capture, many, port = DEFAULT_PORT }) {
  const pairLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 10 });
  const apiLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 120 });
  let httpServer = null;
  let listenPort = port;

  function originOf(req) {
    return requestOrigin(req.headers);
  }

  function requireLoopbackHost(req, res) {
    const expected = `${HOST}:${listenPort}`;
    if (req.headers.host !== expected) {
      json(res, 403, { success: false, error: 'Host not allowed' }, originOf(req));
      return false;
    }
    return true;
  }

  function requireOrigin(req, res) {
    const origin = originOf(req);
    if (!isAllowedExtensionOrigin(origin)) {
      json(res, 403, { success: false, error: 'Origin not allowed' }, origin);
      return null;
    }
    return origin;
  }

  function requireClient(req, res, origin) {
    const token = bearerToken(req);
    const client = token ? pairing.resolveToken(token, origin) : null;
    if (!client) {
      json(
        res,
        401,
        { success: false, error: 'Pair the extension with Dome first' },
        origin,
      );
      return null;
    }
    if (!apiLimiter.take(client.id)) {
      json(res, 429, { success: false, error: 'Too many requests' }, origin);
      return null;
    }
    return client;
  }

  async function handlePair(req, res, origin) {
    if (!pairLimiter.take(req.socket.remoteAddress || 'local')) {
      json(
        res,
        429,
        { success: false, error: 'Too many pairing attempts' },
        origin,
      );
      return;
    }
    const body = await readBody(req, MAX_BODY_BYTES);
    const parsed = PairBodySchema.safeParse(body);
    if (!parsed.success) {
      json(res, 400, { success: false, error: 'Invalid payload' }, origin);
      return;
    }
    try {
      const result = pairing.pair(parsed.data, origin);
      json(res, 200, { success: true, data: result }, origin);
    } catch (err) {
      json(
        res,
        err.statusCode || 400,
        { success: false, error: err.message },
        origin,
      );
    }
  }

  async function handleAuthorizedJson(req, res, origin, schema, fn) {
    const client = requireClient(req, res, origin);
    if (!client) return;
    let body = {};
    if (req.method !== 'GET') body = await readBody(req, MAX_BODY_BYTES);
    const parsed = schema
      ? schema.safeParse(body)
      : { success: true, data: body };
    if (schema && !parsed.success) {
      json(res, 400, { success: false, error: 'Invalid payload' }, origin);
      return;
    }
    try {
      const data = await fn(parsed.data, req, client);
      json(res, 200, { success: true, data }, origin);
    } catch (err) {
      const status = err.statusCode || 500;
      const extra =
        err.payload && typeof err.payload === 'object' ? err.payload : {};
      json(
        res,
        status,
        { success: false, error: err.message, ...extra },
        origin,
      );
    }
  }

  async function handleAiStream(req, res, origin) {
    const client = requireClient(req, res, origin);
    if (!client) return;
    const body = await readBody(req, MAX_BODY_BYTES);
    const parsed = AiStreamBodySchema.safeParse(body);
    if (!parsed.success) {
      json(res, 400, { success: false, error: 'Invalid payload' }, origin);
      return;
    }
    const streamId = parsed.data.streamId || `ext_${Date.now()}`;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...corsHeaders(origin),
    });
    const send = (payload) => writeSse(res, payload);
    let completed = false;
    res.on('close', () => {
      if (!completed) many.cancel(streamId, client.id);
    });
    try {
      send({ type: 'start', streamId, protocolVersion: PROTOCOL_VERSION });
      let emittedDone = false;
      const outcome = await many.stream({
        ...parsed.data,
        streamId,
        clientId: client.id,
        onChunk: (chunk) => {
          emittedDone = relayStreamChunk(send, chunk) || emittedDone;
        },
      });
      const interrupted =
        outcome?.result &&
        typeof outcome.result === 'object' &&
        outcome.result.__interrupt__ === true;
      if (!interrupted && !emittedDone) send({ type: 'done' });
    } catch (err) {
      send({ type: 'error', error: err.message || 'AI error' });
    } finally {
      completed = true;
      res.end();
    }
  }

  async function handleAiResume(req, res, origin) {
    const client = requireClient(req, res, origin);
    if (!client) return;
    const body = await readBody(req, MAX_BODY_BYTES);
    const parsed = AiResumeBodySchema.safeParse(body);
    if (!parsed.success) {
      json(res, 400, { success: false, error: 'Invalid payload' }, origin);
      return;
    }
    many.approval(parsed.data.streamId, client.id);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...corsHeaders(origin),
    });
    const send = (payload) => writeSse(res, payload);
    let completed = false;
    res.on('close', () => {
      if (!completed) many.cancel(parsed.data.streamId, client.id);
    });
    try {
      send({
        type: 'start',
        streamId: parsed.data.streamId,
        resumed: true,
        protocolVersion: PROTOCOL_VERSION,
      });
      let emittedDone = false;
      const outcome = await many.resume({
        ...parsed.data,
        clientId: client.id,
        onChunk: (chunk) => {
          emittedDone = relayStreamChunk(send, chunk) || emittedDone;
        },
      });
      const interrupted =
        outcome?.result &&
        typeof outcome.result === 'object' &&
        outcome.result.__interrupt__ === true;
      if (!interrupted && !emittedDone) send({ type: 'done' });
    } catch (err) {
      send({ type: 'error', error: err.message || 'AI resume error' });
    } finally {
      completed = true;
      res.end();
    }
  }

  async function route(req, res) {
    if (!requireLoopbackHost(req, res)) return;
    const origin = requireOrigin(req, res);
    if (origin == null) return;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(origin));
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${HOST}`);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (req.method === 'GET' && path === '/v1/health') {
      json(
        res,
        200,
        {
          success: true,
          data: { ok: true, version: PROTOCOL_VERSION, port: listenPort },
        },
        origin,
      );
      return;
    }

    if (req.method === 'POST' && path === '/v1/pair') {
      await handlePair(req, res, origin);
      return;
    }

    if (req.method === 'GET' && path === '/v1/context') {
      await handleAuthorizedJson(req, res, origin, null, async () =>
        capture.context(),
      );
      return;
    }

    if (req.method === 'GET' && path === '/v1/bootstrap') {
      await handleAuthorizedJson(req, res, origin, null, async () => ({
        ...(await many.bootstrap()),
        context: capture.context(),
      }));
      return;
    }

    if (req.method === 'GET' && path === '/v1/config') {
      await handleAuthorizedJson(req, res, origin, null, async () =>
        many.getConfig(),
      );
      return;
    }

    if (
      req.method === 'GET' &&
      (path === '/v1/catalogs/skills' || path === '/v1/skills')
    ) {
      await handleAuthorizedJson(req, res, origin, null, async () =>
        many.getSkillsCatalog(),
      );
      return;
    }

    if (
      req.method === 'GET' &&
      (path === '/v1/catalogs/mcp' || path === '/v1/mcp')
    ) {
      await handleAuthorizedJson(req, res, origin, null, async () =>
        many.getMcpCatalog(),
      );
      return;
    }

    if (
      req.method === 'GET' &&
      (path === '/v1/catalogs/models' || path === '/v1/models')
    ) {
      const query = Object.fromEntries(url.searchParams.entries());
      const parsedQuery = ModelsQuerySchema.safeParse(query);
      if (!parsedQuery.success) {
        json(res, 400, { success: false, error: 'Invalid query' }, origin);
        return;
      }
      await handleAuthorizedJson(req, res, origin, null, async () =>
        many.getModelsCatalog(),
      );
      return;
    }

    if (req.method === 'GET' && path === '/v1/projects') {
      await handleAuthorizedJson(req, res, origin, null, async () => ({
        projects: capture.listProjects(),
      }));
      return;
    }

    if (req.method === 'POST' && path === '/v1/resources/search') {
      await handleAuthorizedJson(
        req,
        res,
        origin,
        ResourceSearchBodySchema,
        async (body) => many.searchResources(body),
      );
      return;
    }

    if (req.method === 'POST' && path === '/v1/resources/hydrate') {
      await handleAuthorizedJson(
        req,
        res,
        origin,
        ResourceHydrateBodySchema,
        async (body) => many.hydrateResources(body),
      );
      return;
    }

    if (req.method === 'GET' && path === '/v1/notes') {
      await handleAuthorizedJson(req, res, origin, null, async () => ({
        notes: capture.listNotes(
          url.searchParams.get('projectId') || undefined,
        ),
      }));
      return;
    }

    const noteMatch = /^\/v1\/notes\/([^/]+)$/.exec(path);
    if (noteMatch && req.method === 'GET') {
      await handleAuthorizedJson(req, res, origin, null, async () =>
        capture.getNote(noteMatch[1]),
      );
      return;
    }
    if (noteMatch && req.method === 'PUT') {
      await handleAuthorizedJson(
        req,
        res,
        origin,
        UpdateNoteBodySchema,
        async (body) => capture.updateNote(noteMatch[1], body),
      );
      return;
    }

    const appendMatch = /^\/v1\/notes\/([^/]+)\/append$/.exec(path);
    if (appendMatch && req.method === 'POST') {
      await handleAuthorizedJson(
        req,
        res,
        origin,
        AppendNoteBodySchema,
        async (body) => capture.appendSelection(appendMatch[1], body),
      );
      return;
    }

    if (req.method === 'POST' && path === '/v1/notes') {
      await handleAuthorizedJson(
        req,
        res,
        origin,
        CreateNoteBodySchema,
        async (body) => capture.createNote(body),
      );
      return;
    }

    if (req.method === 'POST' && path === '/v1/contact') {
      await handleAuthorizedJson(
        req,
        res,
        origin,
        ContactBodySchema,
        async (body) => capture.saveContact(body),
      );
      return;
    }

    if (req.method === 'POST' && path === '/v1/capture-url') {
      await handleAuthorizedJson(
        req,
        res,
        origin,
        CaptureUrlBodySchema,
        async (body) => capture.saveUrl(body),
      );
      return;
    }

    if (req.method === 'GET' && path === '/v1/ai/sessions') {
      await handleAuthorizedJson(req, res, origin, null, async () =>
        many.listSessions(),
      );
      return;
    }
    const sessionMatch = /^\/v1\/ai\/sessions\/([a-zA-Z0-9:_-]{1,120})$/.exec(
      path,
    );
    if (req.method === 'GET' && sessionMatch) {
      await handleAuthorizedJson(req, res, origin, null, async () =>
        many.readSession(sessionMatch[1]),
      );
      return;
    }
    if (req.method === 'DELETE' && sessionMatch) {
      await handleAuthorizedJson(req, res, origin, null, async () =>
        many.deleteSession(sessionMatch[1]),
      );
      return;
    }

    const sessionPinMatch =
      /^\/v1\/ai\/sessions\/([a-zA-Z0-9:_-]{1,120})\/pin$/.exec(path);
    if (req.method === 'PUT' && sessionPinMatch) {
      await handleAuthorizedJson(
        req,
        res,
        origin,
        SessionPinBodySchema,
        async (body) => many.pinSession(sessionPinMatch[1], body.pinned),
      );
      return;
    }

    if (req.method === 'POST' && path === '/v1/ai/stream') {
      await handleAiStream(req, res, origin);
      return;
    }

    const approvalMatch =
      /^\/v1\/ai\/approvals\/([a-zA-Z0-9:_-]{1,80})$/.exec(path);
    if (req.method === 'GET' && approvalMatch) {
      await handleAuthorizedJson(
        req,
        res,
        origin,
        null,
        async (_body, _req, client) =>
          many.approval(approvalMatch[1], client.id),
      );
      return;
    }

    if (
      req.method === 'POST' &&
      (path === '/v1/ai/resume' || path === '/v1/ai/approve')
    ) {
      await handleAiResume(req, res, origin);
      return;
    }

    if (req.method === 'POST' && path === '/v1/ai/tool-result') {
      await handleAuthorizedJson(
        req,
        res,
        origin,
        AiToolResultBodySchema,
        async (body, _req, client) =>
          many.completeTool({ ...body, clientId: client.id }),
      );
      return;
    }
    if (req.method === 'POST' && path === '/v1/ai/cancel') {
      await handleAuthorizedJson(
        req,
        res,
        origin,
        AiCancelBodySchema,
        async (body, _req, client) => many.cancel(body.streamId, client.id),
      );
      return;
    }

    json(res, 404, { success: false, error: 'Not found' }, origin);
  }

  function listen() {
    if (httpServer)
      return Promise.resolve({
        success: true,
        port: listenPort,
        alreadyRunning: true,
      });
    const requested = Number(port);
    listenPort =
      Number.isFinite(requested) && requested >= 0 ? requested : DEFAULT_PORT;
    return new Promise((resolve) => {
      httpServer = http.createServer((req, res) => {
        route(req, res).catch((err) => {
          const origin = originOf(req) || 'null';
          const status = err.statusCode || 500;
          json(
            res,
            status,
            { success: false, error: err.message || 'Server error' },
            origin,
          );
        });
      });
      httpServer.listen(listenPort, HOST, () => {
        const addr = httpServer.address();
        if (addr && typeof addr === 'object') listenPort = addr.port;
        resolve({ success: true, port: listenPort });
      });
      httpServer.on('error', (err) => {
        httpServer = null;
        resolve({ success: false, error: err.message });
      });
    });
  }

  function stop() {
    return new Promise((resolve) => {
      if (!httpServer) {
        resolve({ success: true });
        return;
      }
      httpServer.close(() => {
        httpServer = null;
        resolve({ success: true });
      });
    });
  }

  function getStatus() {
    return {
      running: httpServer !== null,
      port: httpServer ? listenPort : null,
      version: PROTOCOL_VERSION,
    };
  }

  return { listen, stop, getStatus };
}

module.exports = { createServer, createRateLimiter };
