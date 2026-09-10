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
  isAllowedExtensionOrigin,
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
        reject(Object.assign(new Error('Payload too large'), { statusCode: 413 }));
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
        reject(Object.assign(new Error('Invalid JSON body'), { statusCode: 400 }));
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

function createServer({ pairing, capture, many, port = DEFAULT_PORT }) {
  const pairLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 10 });
  const apiLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 120 });
  let httpServer = null;
  let listenPort = port;

  function originOf(req) {
    return typeof req.headers.origin === 'string' ? req.headers.origin : '';
  }

  function requireOrigin(req, res) {
    const origin = originOf(req);
    if (origin && !isAllowedExtensionOrigin(origin) && origin !== 'null') {
      json(res, 403, { success: false, error: 'Origin not allowed' }, origin);
      return null;
    }
    return origin || 'null';
  }

  function requireClient(req, res, origin) {
    const token = bearerToken(req);
    const client = token ? pairing.resolveToken(token) : null;
    if (!client) {
      json(res, 401, { success: false, error: 'Pair the extension with Dome first' }, origin);
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
      json(res, 429, { success: false, error: 'Too many pairing attempts' }, origin);
      return;
    }
    const body = await readBody(req, MAX_BODY_BYTES);
    const parsed = PairBodySchema.safeParse(body);
    if (!parsed.success) {
      json(res, 400, { success: false, error: 'Invalid payload' }, origin);
      return;
    }
    try {
      const result = pairing.pair(parsed.data);
      json(res, 200, { success: true, data: result }, origin);
    } catch (err) {
      json(res, err.statusCode || 400, { success: false, error: err.message }, origin);
    }
  }

  async function handleAuthorizedJson(req, res, origin, schema, fn) {
    const client = requireClient(req, res, origin);
    if (!client) return;
    let body = {};
    if (req.method !== 'GET') body = await readBody(req, MAX_BODY_BYTES);
    const parsed = schema ? schema.safeParse(body) : { success: true, data: body };
    if (schema && !parsed.success) {
      json(res, 400, { success: false, error: 'Invalid payload' }, origin);
      return;
    }
    try {
      const data = await fn(parsed.data, req);
      json(res, 200, { success: true, data }, origin);
    } catch (err) {
      const status = err.statusCode || 500;
      const extra = err.payload && typeof err.payload === 'object' ? err.payload : {};
      json(res, status, { success: false, error: err.message, ...extra }, origin);
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
    const send = (payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    req.on('close', () => {
      many.cancel(streamId);
    });
    try {
      send({ type: 'start', streamId });
      await many.stream({
        ...parsed.data,
        streamId,
        onChunk: (chunk) => {
          if (!chunk || typeof chunk !== 'object') return;
          if (chunk.type === 'text' && chunk.text) send({ type: 'delta', text: chunk.text });
          if (chunk.type === 'error') send({ type: 'error', error: chunk.error || 'AI error' });
          if (chunk.type === 'done') send({ type: 'done' });
        },
      });
      send({ type: 'done' });
    } catch (err) {
      send({ type: 'error', error: err.message || 'AI error' });
    } finally {
      res.end();
    }
  }

  const STATIC_ROUTES = new Map([
    [
      'GET /v1/health',
      (_req, res, origin) =>
        json(res, 200, { success: true, data: { ok: true, version: PROTOCOL_VERSION, port: listenPort } }, origin),
    ],
    ['POST /v1/pair', (req, res, origin) => handlePair(req, res, origin)],
    [
      'GET /v1/context',
      (req, res, origin) => handleAuthorizedJson(req, res, origin, null, async () => capture.context()),
    ],
    [
      'GET /v1/projects',
      (req, res, origin) =>
        handleAuthorizedJson(req, res, origin, null, async () => ({ projects: capture.listProjects() })),
    ],
    [
      'GET /v1/notes',
      (req, res, origin, url) =>
        handleAuthorizedJson(req, res, origin, null, async () => ({
          notes: capture.listNotes(url.searchParams.get('projectId') || undefined),
        })),
    ],
    [
      'POST /v1/notes',
      (req, res, origin) =>
        handleAuthorizedJson(req, res, origin, CreateNoteBodySchema, async (body) => capture.createNote(body)),
    ],
    [
      'POST /v1/contact',
      (req, res, origin) =>
        handleAuthorizedJson(req, res, origin, ContactBodySchema, async (body) => capture.saveContact(body)),
    ],
    [
      'POST /v1/capture-url',
      (req, res, origin) =>
        handleAuthorizedJson(req, res, origin, CaptureUrlBodySchema, async (body) => capture.saveUrl(body)),
    ],
    ['POST /v1/ai/stream', (req, res, origin) => handleAiStream(req, res, origin)],
    [
      'POST /v1/ai/cancel',
      (req, res, origin) =>
        handleAuthorizedJson(req, res, origin, AiCancelBodySchema, async (body) => many.cancel(body.streamId)),
    ],
  ]);

  async function handleNoteResource(req, res, origin, id) {
    if (req.method === 'GET') {
      await handleAuthorizedJson(req, res, origin, null, async () => capture.getNote(id));
      return;
    }
    if (req.method === 'PUT') {
      await handleAuthorizedJson(req, res, origin, UpdateNoteBodySchema, async (body) =>
        capture.updateNote(id, body),
      );
      return;
    }
    json(res, 404, { success: false, error: 'Not found' }, origin);
  }

  async function route(req, res) {
    const origin = requireOrigin(req, res);
    if (origin == null) return;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(origin));
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${HOST}`);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    const handler = STATIC_ROUTES.get(`${req.method} ${path}`);
    if (handler) {
      await handler(req, res, origin, url);
      return;
    }

    const noteMatch = /^\/v1\/notes\/([^/]+)$/.exec(path);
    if (noteMatch && (req.method === 'GET' || req.method === 'PUT')) {
      await handleNoteResource(req, res, origin, noteMatch[1]);
      return;
    }

    const appendMatch = /^\/v1\/notes\/([^/]+)\/append$/.exec(path);
    if (appendMatch && req.method === 'POST') {
      await handleAuthorizedJson(req, res, origin, AppendNoteBodySchema, async (body) =>
        capture.appendSelection(appendMatch[1], body),
      );
      return;
    }

    json(res, 404, { success: false, error: 'Not found' }, origin);
  }

  function listen() {
    if (httpServer) return Promise.resolve({ success: true, port: listenPort, alreadyRunning: true });
    const requested = Number(port);
    listenPort = Number.isFinite(requested) && requested >= 0 ? requested : DEFAULT_PORT;
    return new Promise((resolve) => {
      httpServer = http.createServer((req, res) => {
        route(req, res).catch((err) => {
          const origin = originOf(req) || 'null';
          const status = err.statusCode || 500;
          json(res, status, { success: false, error: err.message || 'Server error' }, origin);
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
