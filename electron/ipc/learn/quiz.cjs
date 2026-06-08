/* eslint-disable no-console */
const crypto = require('crypto');
const { z } = require('zod');
const { invalidateLearnKpisCache } = require('../../services/learn-kpis.cjs');

const QuizCreateRunSchema = z.object({
  id: z.string().optional(),
  studio_output_id: z.string().min(1),
  deck_id: z.string().nullable().optional(),
  total: z.number().int().nonnegative(),
  correct: z.number().int().nonnegative(),
  duration_ms: z.number().int().nonnegative(),
  per_question: z.union([z.string(), z.array(z.unknown())]).optional(),
  started_at: z.number().int().optional(),
  completed_at: z.number().int().optional(),
});

const IdSchema = z.string().min(1);

function generateId() {
  return crypto.randomUUID();
}

function register({ ipcMain, windowManager, database, validateSender }) {
  ipcMain.handle('quiz:createRun', (event, data) => {
    try {
      validateSender(event, windowManager);
      const parsed = QuizCreateRunSchema.safeParse(data);
      if (!parsed.success) {
        return { success: false, error: parsed.error.message };
      }
      const payload = parsed.data;
      const db = database.getDB();
      const id = payload.id || generateId();
      const now = Date.now();
      const perQuestion =
        typeof payload.per_question === 'string'
          ? payload.per_question
          : JSON.stringify(payload.per_question ?? []);
      const startedAt = payload.started_at ?? now;
      const completedAt = payload.completed_at ?? now;

      // Resolve project for the unified study event via the studio output
      const projectRow = db
        .prepare('SELECT project_id FROM studio_outputs WHERE id = ?')
        .get(payload.studio_output_id);

      const persist = db.transaction(() => {
        db.prepare(
          `INSERT INTO quiz_runs (
            id, studio_output_id, deck_id, total, correct, duration_ms,
            per_question, started_at, completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          payload.studio_output_id,
          payload.deck_id ?? null,
          payload.total,
          payload.correct,
          payload.duration_ms,
          perQuestion,
          startedAt,
          completedAt,
        );
        // Mirror into unified study_events so quizzes count toward streak/time
        database.getQueries().createStudyEvent.run(
          id,
          projectRow?.project_id || null,
          payload.deck_id ?? null,
          payload.studio_output_id,
          'quiz',
          payload.total,
          payload.correct,
          Math.max(0, payload.total - payload.correct),
          payload.duration_ms,
          startedAt,
          completedAt,
        );
      });
      persist();
      invalidateLearnKpisCache(db);

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
      const parsed = IdSchema.safeParse(studioOutputId);
      if (!parsed.success) {
        return { success: false, error: parsed.error.message };
      }
      const db = database.getDB();
      const rows = db
        .prepare('SELECT * FROM quiz_runs WHERE studio_output_id = ? ORDER BY completed_at DESC LIMIT 50')
        .all(parsed.data);
      return { success: true, data: rows };
    } catch (error) {
      console.error('[Quiz] listRuns error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('quiz:getRun', (event, runId) => {
    try {
      validateSender(event, windowManager);
      const parsed = IdSchema.safeParse(runId);
      if (!parsed.success) {
        return { success: false, error: parsed.error.message };
      }
      const db = database.getDB();
      const row = db.prepare('SELECT * FROM quiz_runs WHERE id = ?').get(parsed.data);
      if (!row) return { success: false, error: 'Run not found' };
      return { success: true, data: row };
    } catch (error) {
      console.error('[Quiz] getRun error:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
