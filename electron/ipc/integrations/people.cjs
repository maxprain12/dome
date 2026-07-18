'use strict';

const peopleStore = require('../../people/people-store.cjs');

function ok(data) {
  return { success: true, data };
}

function fail(err) {
  const message = typeof err === 'string' ? err : err?.message || 'Unknown error';
  return { success: false, error: message };
}

function register({ ipcMain, windowManager }) {
  const guard = (event) => windowManager.isAuthorized(event.sender.id);

  ipcMain.handle('people:list', (event, projectId) => {
    if (!guard(event)) return fail('Unauthorized');
    try {
      return ok({ people: peopleStore.listPeople(projectId) });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('people:get', (event, id) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof id !== 'string') return fail('Invalid id');
    try {
      const person = peopleStore.getPerson(id);
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
}

module.exports = { register };
