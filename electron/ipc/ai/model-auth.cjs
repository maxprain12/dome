'use strict';
const { z } = require('zod');
const { randomUUID } = require('node:crypto');
const { getModelCollection } = require('../../ai/model-collection.cjs');
const flows = new Map();
const Id = z.object({ id: z.string().uuid() }).strict();
function register({ ipcMain, windowManager, database }) {
  const handle = (schema, operation) => async (event, raw) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    try { return await operation(schema.parse(raw), event.sender); } catch (error) { return { success: false, error: error.message }; }
  };
  const find = (id, sender) => { const flow = flows.get(id); if (!flow || flow.sender !== sender.id) throw new Error('Login session expired'); return flow; };
  ipcMain.handle('ai:provider-login', handle(z.object({ provider: z.string().min(1).max(100), type: z.enum(['api_key', 'oauth']) }).strict(), async (args, sender) => {
    for (const flow of flows.values()) if (flow.sender === sender.id && flow.state === 'pending') throw new Error('Finish or cancel the current login first');
    const models = await getModelCollection(database);
    const id = randomUUID(); const controller = new AbortController();
    const flow = { sender: sender.id, controller, events: [], prompt: null, state: 'pending' }; flows.set(id, flow);
    const timer = setTimeout(() => controller.abort(), 300000);
    const interaction = { signal: controller.signal,
      notify: event => { flow.events.push(event); flow.events = flow.events.slice(-20); },
      prompt: prompt => new Promise((resolve, reject) => {
        const promptId = randomUUID();
        const signal = prompt.signal ? AbortSignal.any([controller.signal, prompt.signal]) : controller.signal;
        const { signal: _signal, ...visible } = prompt;
        const abort = () => { flow.prompt = null; reject(Object.assign(new Error('Login cancelled'), { name: 'AbortError' })); };
        if (signal.aborted) { abort(); return; }
        signal.addEventListener('abort', abort, { once: true });
        flow.prompt = { ...visible, id: promptId };
        flow.respond = value => { signal.removeEventListener('abort', abort); flow.prompt = null; resolve(value); };
      }),
    };
    sender.once('destroyed', () => controller.abort());
    void models.login(args.provider, args.type, interaction).then(() => { flow.state = 'complete'; }, error => { flow.state = 'failed'; flow.error = error.message; }).finally(() => {
      clearTimeout(timer); flow.respond = null; flow.prompt = null;
      const expiration = setTimeout(() => flows.delete(id), 300000); expiration.unref();
    });
    return { success: true, data: { id } };
  }));
  ipcMain.handle('ai:provider-login-status', handle(Id, (args, sender) => {
    const flow = find(args.id, sender); return { success: true, data: { state: flow.state, events: flow.events, prompt: flow.prompt, error: flow.error } };
  }));
  ipcMain.handle('ai:provider-login-answer', handle(Id.extend({ promptId: z.string().uuid(), value: z.string().max(10000) }), (args, sender) => {
    const flow = find(args.id, sender);
    if (flow.prompt?.id !== args.promptId || !flow.respond) throw new Error('Login prompt expired');
    if (flow.prompt.type === 'select' && !flow.prompt.options.some(option => option.id === args.value)) throw new Error('Unknown login option');
    const respond = flow.respond; flow.respond = null; respond(args.value); return { success: true };
  }));
  ipcMain.handle('ai:provider-login-cancel', handle(Id, (args, sender) => { find(args.id, sender).controller.abort(); return { success: true }; }));
}
module.exports = { register };
