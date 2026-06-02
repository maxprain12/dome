/* eslint-disable no-console */
const crypto = require('crypto');

function generateId() {
  return crypto.randomUUID();
}

function register({ ipcMain, windowManager, database, validateSender }) {
  ipcMain.handle('quiz:createRun', (event, data) => {
    try {
      validateSender(event, windowManager);
      const db = database.getDB();
      const id = data.id || generateId();
      const now = Date.now();
      const perQuestion =
        typeof data.per_question === 'string'
          ? data.per_question
          : JSON.stringify(data.per_question ?? []);

      db.prepare(
        `
        INSERT INTO quiz_runs (
          id, studio_output_id, deck_id, total, correct, duration_ms,
          per_question, started_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        id,
        data.studio_output_id,
        data.deck_id ?? null,
        data.total,
        data.correct,
        data.duration_ms,
        perQuestion,
        data.started_at ?? now,
        data.completed_at ?? now,
      );

      const created = db.prepare('SELECT * FROM quiz_runs WHERE id = ?').get(id);
      windowManager.broadcast('flashcard:sessionEnded', { type: 'quiz', runId: id });
      return { success: true, data: created };
    } catch (error) {
      console.error('[Quiz] createRun error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('quiz:listRuns', (event, studioOutputId) => {
    try {
      validateSender(event, windowManager);
      const db = database.getDB();
      const rows = db
        .prepare('SELECT * FROM quiz_runs WHERE studio_output_id = ? ORDER BY completed_at DESC LIMIT 50')
        .all(studioOutputId);
      return { success: true, data: rows };
    } catch (error) {
      console.error('[Quiz] listRuns error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('quiz:getRun', (event, runId) => {
    try {
      validateSender(event, windowManager);
      const db = database.getDB();
      const row = db.prepare('SELECT * FROM quiz_runs WHERE id = ?').get(runId);
      if (!row) return { success: false, error: 'Run not found' };
      return { success: true, data: row };
    } catch (error) {
      console.error('[Quiz] getRun error:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
