
'use strict';
const { z } = require('zod');
const { Input, Policy } = require('../../research/schemas.cjs');
const { POLICY_KEY } = require('../../research/budget.cjs');
const { getResearchService } = require('../../research/service.cjs');
const Action = z.object({ name: z.enum(['research_search','research_read','research_profile','research_collect']), input: Input, requestId: z.string().uuid().optional() }).strict();
const Cancel = z.object({ id: z.string().uuid() });
function register({ ipcMain, windowManager, database }) {
  const requests = new Map();
  const allowed = (event) => windowManager.isAuthorized(event.sender.id);
  ipcMain.handle('research:status', (event) => {
    if (!allowed(event)) return { success: false, error: 'Unauthorized' };
    return getResearchService().status();
  });
  ipcMain.handle('research:execute', async (event, raw) => {
    if (!allowed(event)) return { success: false, error: 'Unauthorized' };
    const parsed = Action.safeParse(raw);
    if (!parsed.success) return { success: false, error: 'Invalid research request' };
    const id = parsed.data.requestId;
    if (id && (requests.has(id) || requests.size >= 20)) return { success: false, error: 'research_busy' };
    const controller = new AbortController();
    if (id) requests.set(id, { controller, senderId: event.sender.id });
    try { return await getResearchService().execute(parsed.data.name, parsed.data.input, { signal: controller.signal }); }
    finally { if (id) requests.delete(id); }
  });
  ipcMain.handle('research:policy', (event, raw) => {
    if (!allowed(event)) return { success: false, error: 'Unauthorized' };
    const parsed = Policy.safeParse(raw);
    if (!parsed.success) return { success: false, error: 'Invalid research policy' };
    database.getQueries().setSetting.run(POLICY_KEY, JSON.stringify(parsed.data), Date.now());
    return { success: true };
  });
  ipcMain.handle('research:cancel', (event, raw) => {
    if (!allowed(event)) return { success: false, error: 'Unauthorized' };
    const parsed = Cancel.safeParse(raw);
    if (!parsed.success) return { success: false, error: 'Invalid research job' };
    const request = requests.get(parsed.data.id);
    if (request && request.senderId === event.sender.id) { request.controller.abort(); return { success: true }; }
    return getResearchService().cancel(parsed.data.id);
  });
}
module.exports = { register };
