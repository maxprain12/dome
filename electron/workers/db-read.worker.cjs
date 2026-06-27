/* eslint-disable no-console */
'use strict';

const { parentPort } = require('worker_threads');
const Database = require('better-sqlite3');

/** @param {import('worker_threads').MessagePort} port */
function handleMessage(msg) {
  const { id, type, payload, dbPath } = msg;
  if (!dbPath) {
    parentPort.postMessage({ id, ok: false, error: 'dbPath required' });
    return;
  }
  let db;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    db.pragma('busy_timeout = 5000');
    let result;
    if (type === 'searchResourcesFts') {
      const query = String(payload?.query || '').trim();
      if (!query) {
        result = [];
      } else {
        result = db
          .prepare(
            `SELECT r.id, r.project_id, r.type, r.title, r.updated_at
             FROM resources r
             JOIN resources_fts fts ON r.id = fts.resource_id
             WHERE resources_fts MATCH ?
             ORDER BY rank
             LIMIT ?`,
          )
          .all(query, Number(payload?.limit) || 25);
      }
    } else if (type === 'listProjectResourceIds') {
      const projectId = payload?.projectId;
      if (!projectId) {
        result = [];
      } else {
        result = db
          .prepare('SELECT id FROM resources WHERE project_id = ?')
          .all(projectId)
          .map((r) => r.id);
      }
    } else {
      throw new Error(`Unknown db-read task: ${type}`);
    }
    parentPort.postMessage({ id, ok: true, result });
  } catch (err) {
    parentPort.postMessage({ id, ok: false, error: err?.message || String(err) });
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
  }
}

parentPort.on('message', handleMessage);
