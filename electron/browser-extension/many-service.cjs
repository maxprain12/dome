'use strict';

const { MAX_PAGE_TEXT_CHARS } = require('./protocol.cjs');

const PROMPTS = {
  summarize:
    'Resume el siguiente contenido web en viñetas claras y fieles al texto. No inventes datos. Responde en el idioma del contenido.',
  key_ideas:
    'Extrae las ideas clave, nombres propios y posibles siguientes pasos del contenido. Sé conciso. Responde en el idioma del contenido.',
};

function buildUserMessage({ action, text, prompt, url, title }) {
  const instruction =
    action === 'ask'
      ? String(prompt || '').trim() || 'Ayúdame a entender este contenido.'
      : PROMPTS[action] || PROMPTS.summarize;
  const clipped = String(text || '').slice(0, MAX_PAGE_TEXT_CHARS);
  const header = [title && `Título: ${title}`, url && `URL: ${url}`].filter(Boolean).join('\n');
  return `${instruction}\n\n${header}\n\n---\n${clipped}`;
}

function createManyService(deps = {}) {
  const controllers = new Map();
  const getDatabase = deps.getDatabase || (() => require('../core/database.cjs'));
  const resolveProviderConfig =
    deps.resolveProviderConfig ||
    ((database) => require('../ai/resolve-provider-config.cjs').resolveProviderConfig(database));
  const runManyAgent =
    deps.runManyAgent || ((opts) => require('../agents/agent-runtime.cjs').runManyAgent(opts));

  async function stream({ action, text, prompt, url, title, streamId, onChunk, signal }) {
    const id = streamId || `ext_${Date.now()}`;
    const database = getDatabase();
    const cfg = await resolveProviderConfig(database);
    const controller = new AbortController();
    controllers.set(id, controller);
    const onAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    try {
      const result = await runManyAgent({
        provider: cfg.provider,
        model: cfg.model,
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
        messages: [
          {
            role: 'system',
            content:
              'Eres Many, el asistente de Dome. El usuario te envía texto capturado desde el navegador. No uses herramientas. No mutes la biblioteca. Responde solo con texto útil.',
          },
          {
            role: 'user',
            content: buildUserMessage({ action, text, prompt, url, title }),
          },
        ],
        toolDefinitions: [],
        useDirectTools: false,
        skipHitl: true,
        hitlInterrupt: false,
        onChunk,
        signal: controller.signal,
        threadId: `browser-extension:${id}`,
      });
      return { streamId: id, result };
    } finally {
      controllers.delete(id);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }

  function cancel(streamId) {
    const controller = controllers.get(streamId);
    if (controller) controller.abort();
    controllers.delete(streamId);
    return { cancelled: Boolean(controller) };
  }

  return { stream, cancel, buildUserMessage };
}

module.exports = { createManyService, buildUserMessage };
