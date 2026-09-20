'use strict';

const fs = require('node:fs/promises');
const { PROTOCOL_VERSION, AGENT_MODES } = require('./protocol.cjs');
const { getAllToolDefinitions } = require('../tools/tool-definitions.cjs');
const { getAISettings } = require('../ai/ai-settings.cjs');
const bridge = require('../agents/dome-harness-bridge.cjs');
const { clip, toPublicMessages } = require('./public-session.cjs');

const MAX_SESSIONS = 50;
const MAX_TITLE = 100;
const MAX_MODELS = 40;

function modelLabel(id) {
  const raw = String(id || '').trim();
  if (!raw) return 'Modelo';
  if (raw === 'dome/auto') return 'Dome Auto';
  const tail = raw.includes('/') ? raw.slice(raw.lastIndexOf('/') + 1) : raw;
  return tail.replace(/[-_]/g, ' ');
}

function epoch(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function titleFromJsonl(filePath) {
  if (!filePath) return 'Many';
  let fh = null;
  try {
    fh = await fs.open(filePath, 'r');
    const buf = Buffer.alloc(65536);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    const lines = buf.toString('utf8', 0, bytesRead).split('\n');
    if (bytesRead === buf.length) lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }
      const entry = parsed?.entry && parsed.kind === 'entry' ? parsed.entry : parsed;
      const message = entry?.type === 'message' ? entry.message : null;
      if (message?.role !== 'user') continue;
      const content = message.content;
      const raw = typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join(' ')
          : '';
      const title = clip(raw.split('\n')[0], MAX_TITLE);
      if (title) return title;
    }
  } catch {
    /* keep fallback */
  } finally {
    if (fh) await fh.close().catch(() => {});
  }
  return 'Many';
}

async function listPublicSessions() {
  const repo = await bridge.getSessionRepo();
  const metas = (await repo.list({ cwd: bridge.SESSION_CWD }))
    .filter((meta) => bridge.isRootSessionMeta(meta) && !String(meta.id || '').startsWith('workflow-'))
    .slice(0, MAX_SESSIONS);
  const titles = await Promise.all(metas.map((meta) => titleFromJsonl(meta.path)));
  const sessions = metas.map((meta, index) => ({
    id: meta.id,
    title: titles[index] || 'Many',
    updatedAt: meta.updatedAt || meta.createdAt || null,
    createdAt: meta.createdAt || null,
  }));
  sessions.sort((a, b) => epoch(b.updatedAt || b.createdAt) - epoch(a.updatedAt || a.createdAt));
  return { sessions };
}

async function getPublicSession(threadId) {
  const id = String(threadId || '').trim();
  if (!id) return { threadId: id, title: 'Many', messages: [] };
  const meta = await bridge.findSessionMetadata(id);
  if (!meta) return { threadId: id, title: 'Many', messages: [] };
  try {
    const repo = await bridge.getSessionRepo();
    const session = await repo.open(meta);
    const context = await session.buildContext();
    return {
      threadId: id,
      title: await titleFromJsonl(meta.path),
      messages: toPublicMessages(context.messages || [], id),
    };
  } catch {
    return { threadId: id, title: 'Many', messages: [] };
  }
}

function listToolNames() {
  return getAllToolDefinitions()
    .map((def) => def?.function?.name)
    .filter((name) => typeof name === 'string' && name.length > 0)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

async function listPublicModels(database, settings) {
  const current = settings?.model || null;
  const models = [];
  const push = (id, label) => {
    if (!id || models.some((row) => row.id === id)) return;
    models.push({
      id,
      label: label || modelLabel(id),
      provider: settings?.provider || null,
    });
  };
  if (settings?.provider === 'dome') push('dome/auto', 'Dome Auto');
  push(current);
  try {
    const { fetchProviderModels } = require('../ai/provider-models.cjs');
    let timer;
    const result = await Promise.race([
      fetchProviderModels(settings.provider, {
        apiKey: settings.apiKey,
        database,
        baseUrl: settings.baseUrl,
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('models_timeout')), 2500);
      }),
    ]);
    clearTimeout(timer);
    const rows = Array.isArray(result) ? result : result?.models || [];
    for (const row of rows) {
      const id = row?.id || row?.name;
      if (!id) continue;
      push(id, row.name || row.label);
      if (models.length >= MAX_MODELS) break;
    }
  } catch {
    /* keep current model */
  }
  return models;
}

async function buildCapabilities(database, options = {}) {
  const settings = database ? await getAISettings(database) : {};
  const models = options.includeModels
    ? await listPublicModels(database, settings)
    : (settings.model ? [{ id: settings.model, label: modelLabel(settings.model) }] : []);
  return {
    protocolVersion: PROTOCOL_VERSION,
    model: settings.model || null,
    modelLabel: modelLabel(settings.model),
    provider: settings.provider || null,
    models,
    tools: listToolNames(),
    sessions: ['list', 'start', 'get'],
    modes: [...AGENT_MODES],
    agentMode: 'agent',
    streamEvents: [
      'start',
      'text',
      'thinking',
      'tool_call',
      'tool_progress',
      'tool_result',
      'approval',
      'plan',
      'done',
      'error',
    ],
    requiresLocalUi: ['browser_*', 'ui_*'],
    remoteOnly: true,
  };
}

module.exports = {
  listPublicSessions,
  getPublicSession,
  buildCapabilities,
  modelLabel,
};
