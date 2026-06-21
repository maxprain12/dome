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
  ipcMain.handle('quiz:createRun', async (event, data) => {
    try {
      validateSender(event, windowManager);
      const parsed = QuizCreateRunSchema.safeParse(data);
      if (!parsed.success) {
        return { success: false, error: parsed.error.message };
      }
      const payload = parsed.data;
      const db = database.getDB();
      const queries = database.getQueries();
      const id = payload.id || generateId();
      const now = Date.now();
      const perQuestion =
        typeof payload.per_question === 'string'
          ? payload.per_question
          : JSON.stringify(payload.per_question ?? []);
      const startedAt = payload.started_at ?? now;
      const completedAt = payload.completed_at ?? now;

      const projectRow = await db.get('SELECT project_id FROM studio_outputs WHERE id = ?', [
        payload.studio_output_id,
      ]);

      await db.transaction(async (tx) => {
        await tx.run(
          `INSERT INTO quiz_runs (
            id, studio_output_id, deck_id, total, correct, duration_ms,
            per_question, started_at, completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            payload.studio_output_id,
            payload.deck_id ?? null,
            payload.total,
            payload.correct,
            payload.duration_ms,
            perQuestion,
            startedAt,
            completedAt,
          ],
        );
        await queries.createStudyEvent.run(
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
      await invalidateLearnKpisCache(db);

      const created = await db.get('SELECT * FROM quiz_runs WHERE id = ?', [id]);
      windowManager.broadcast('flashcard:sessionEnded', { type: 'quiz', runId: id });
      return { success: true, data: created };
    } catch (error) {
      console.error('[Quiz] createRun error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('quiz:listRuns', async (event, studioOutputId) => {
    try {
      validateSender(event, windowManager);
      const parsed = IdSchema.safeParse(studioOutputId);
      if (!parsed.success) {
        return { success: false, error: parsed.error.message };
      }
      const db = database.getDB();
      const rows = await db.all(
        'SELECT * FROM quiz_runs WHERE studio_output_id = ? ORDER BY completed_at DESC LIMIT 50',
        [parsed.data],
      );
      return { success: true, data: rows };
    } catch (error) {
      console.error('[Quiz] listRuns error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('quiz:getRun', async (event, runId) => {
    try {
      validateSender(event, windowManager);
      const parsed = IdSchema.safeParse(runId);
      if (!parsed.success) {
        return { success: false, error: parsed.error.message };
      }
      const db = database.getDB();
      const row = await db.get('SELECT * FROM quiz_runs WHERE id = ?', [parsed.data]);
      if (!row) return { success: false, error: 'Run not found' };
      return { success: true, data: row };
    } catch (error) {
      console.error('[Quiz] getRun error:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
