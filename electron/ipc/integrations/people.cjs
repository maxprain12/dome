'use strict';

const peopleStore = require('../../people/people-store.cjs');
const domeOauth = require('../../auth/dome-oauth.cjs');
const { getDomeProviderBaseUrl } = require('../../ai/dome-provider-url.cjs');
const database = require('../../core/database.cjs');

function ok(data) {
  return { success: true, data };
}

function fail(err) {
  const message = typeof err === 'string' ? err : err?.message || 'Unknown error';
  return { success: false, error: message };
}

function register({ ipcMain, windowManager }) {
  const guard = (event) => windowManager.isAuthorized(event.sender.id);

  ipcMain.handle('people:list', (event, payload) => {
    if (!guard(event)) return fail('Unauthorized');
    try {
      const projectId = typeof payload === 'string' ? payload : payload?.projectId;
      const leadStatus = typeof payload === 'object' ? payload?.leadStatus : undefined;
      const limit = typeof payload === 'object' ? payload?.limit : undefined;
      return ok({ people: peopleStore.listPeople(projectId, { leadStatus, limit }) });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('people:get', (event, payload) => {
    if (!guard(event)) return fail('Unauthorized');
    const id = typeof payload === 'string' ? payload : payload?.id;
    const includeInteractions =
      typeof payload === 'object' ? Boolean(payload?.includeInteractions) : true;
    if (typeof id !== 'string') return fail('Invalid id');
    try {
      const person = peopleStore.getPerson(id, { includeInteractions });
      if (!person) return fail('Not found');
      return ok({ person });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('people:search', (event, payload) => {
    if (!guard(event)) return fail('Unauthorized');
    const projectId = payload?.projectId;
    const query = payload?.query;
    const limit = payload?.limit;
    if (typeof query !== 'string') return fail('Invalid query');
    try {
      return ok({ people: peopleStore.searchPeople(projectId, query, { limit }) });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('people:upsert', (event, payload) => {
    if (!guard(event)) return fail('Unauthorized');
    if (!payload || typeof payload !== 'object') return fail('Invalid payload');
    try {
      const person = peopleStore.upsertPerson(payload);
      return ok({ person });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('people:linkIdentity', (event, payload) => {
    if (!guard(event)) return fail('Unauthorized');
    if (!payload || typeof payload !== 'object') return fail('Invalid payload');
    try {
      return ok(peopleStore.linkIdentity(payload));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('people:upsertIdentity', (event, payload) => {
    if (!guard(event)) return fail('Unauthorized');
    if (!payload || typeof payload !== 'object') return fail('Invalid payload');
    try {
      const person = peopleStore.upsertIdentityPerson(payload);
      return ok({ person });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('people:syncGithub', (event, projectId) => {
    if (!guard(event)) return fail('Unauthorized');
    try {
      return ok(peopleStore.syncGithubIdentitiesFromStore(projectId));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('people:updateProfile', (event, payload) => {
    if (!guard(event)) return fail('Unauthorized');
    if (!payload || typeof payload !== 'object') return fail('Invalid payload');
    try {
      const person = peopleStore.updateProfile(payload);
      return ok({ person });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('people:addInteraction', (event, payload) => {
    if (!guard(event)) return fail('Unauthorized');
    if (!payload || typeof payload !== 'object') return fail('Invalid payload');
    try {
      const interaction = peopleStore.addInteraction(payload);
      return ok({ interaction });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('people:ingest', (event, payload) => {
    if (!guard(event)) return fail('Unauthorized');
    if (!payload || typeof payload !== 'object') return fail('Invalid payload');
    try {
      return ok(peopleStore.ingestPeople(payload));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('people:delete', (event, payload) => {
    if (!guard(event)) return fail('Unauthorized');
    try {
      if (typeof payload === 'string') {
        return ok(peopleStore.deletePerson(payload));
      }
      if (payload && typeof payload === 'object' && Array.isArray(payload.ids)) {
        return ok(peopleStore.deletePeople(payload.ids));
      }
      const id = payload?.id;
      if (typeof id !== 'string') return fail('Invalid id');
      return ok(peopleStore.deletePerson(id));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('people:enrich', async (event, payload) => {
    if (!guard(event)) return fail('Unauthorized');
    const personId = typeof payload === 'string' ? payload : payload?.personId || payload?.id;
    if (typeof personId !== 'string' || !personId) return fail('Invalid personId');
    try {
      const base = getDomeProviderBaseUrl().replace(/\/$/, '');
      const res = await domeOauth.fetchWithDomeAuth(database, `${base}/api/v1/people/enrich`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ personId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return fail(data?.error || `enrich_failed_${res.status}`);
      }
      const person = peopleStore.applyCloudPersonEnrichment(
        personId,
        data.person,
        data.identity,
      );
      return ok({ person });
    } catch (err) {
      return fail(err);
    }
  });
}

module.exports = { register };
