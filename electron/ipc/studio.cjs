/* eslint-disable no-console */
const crypto = require('crypto');
const { validateAndNormalizeStudioContent } = require('../services/studio-validators.cjs');
const { cancelRun } = require('../services/studio-progress.cjs');

function generateId() {
  return crypto.randomUUID();
}

/**
 * Validate studio content before create/update.
 * @param {string} type
 * @param {unknown} content
 * @returns {{ ok: boolean, content: string|null, errors: string[] }}
 */
function validateStudioContentForPersist(type, content) {
  if (content == null || content === '') {
    const result = validateAndNormalizeStudioContent(type, content);
    if (!result.ok) {
      return { ok: false, content: null, errors: result.errors };
    }
    return { ok: true, content: result.content, errors: [] };
  }

  const result = validateAndNormalizeStudioContent(type, content);
  if (!result.ok) {
    return { ok: false, content: null, errors: result.errors };
  }
  return { ok: true, content: result.content, errors: result.errors };
}

function register({ ipcMain, windowManager, database, validateSender }) {
  // Create studio output
  ipcMain.handle('db:studio:create', (event, data) => {
    try {
      validateSender(event, windowManager);
      const db = database.getDB();
      const id = data.id || generateId();
      const now = Date.now();

      const contentValidation = validateStudioContentForPersist(data.type, data.content);
      if (!contentValidation.ok) {
        return {
          success: false,
          error: 'studio.validation_failed',
          errors: contentValidation.errors,
        };
      }

      const stmt = db.prepare(`
        INSERT INTO studio_outputs (id, project_id, type, title, content, source_ids, file_path, metadata, deck_id, resource_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        data.project_id,
        data.type,
        data.title,
        contentValidation.content,
        data.source_ids ? (typeof data.source_ids === 'string' ? data.source_ids : JSON.stringify(data.source_ids)) : null,
        data.file_path || null,
        data.metadata ? (typeof data.metadata === 'string' ? data.metadata : JSON.stringify(data.metadata)) : null,
        data.deck_id || null,
        data.resource_id || null,
        now,
        now
      );

      const created = db.prepare('SELECT * FROM studio_outputs WHERE id = ?').get(id);
      return { success: true, data: created };
    } catch (error) {
      console.error('[DB] Error creating studio output:', error);
      return { success: false, error: error.message };
    }
  });

  // Get all studio outputs across all projects
  ipcMain.handle('db:studio:getAll', (event, limit = 500) => {
    try {
      validateSender(event, windowManager);
      const db = database.getDB();
      const stmt = db.prepare(`
        SELECT s.*, d.card_count as deck_card_count
        FROM studio_outputs s
        LEFT JOIN flashcard_decks d ON s.deck_id = d.id
        ORDER BY s.updated_at DESC
        LIMIT ?
      `);
      const results = stmt.all(limit);
      return { success: true, data: results };
    } catch (error) {
      console.error('[DB] Error getting all studio outputs:', error);
      return { success: false, error: error.message };
    }
  });

  // Get studio outputs by project (with flashcard deck stats for type=flashcards)
  ipcMain.handle('db:studio:getByProject', (event, projectId) => {
    try {
      validateSender(event, windowManager);
      const db = database.getDB();
      const stmt = db.prepare(`
        SELECT s.*, d.card_count as deck_card_count
        FROM studio_outputs s
        LEFT JOIN flashcard_decks d ON s.deck_id = d.id
        WHERE s.project_id = ?
        ORDER BY s.updated_at DESC
      `);
      const results = stmt.all(projectId);
      return { success: true, data: results };
    } catch (error) {
      console.error('[DB] Error getting studio outputs by project:', error);
      return { success: false, error: error.message };
    }
  });

  // Get studio output by id
  ipcMain.handle('db:studio:getById', (event, id) => {
    try {
      validateSender(event, windowManager);
      const db = database.getDB();
      const stmt = db.prepare('SELECT * FROM studio_outputs WHERE id = ?');
      const result = stmt.get(id);
      return { success: true, data: result || null };
    } catch (error) {
      console.error('[DB] Error getting studio output:', error);
      return { success: false, error: error.message };
    }
  });

  // Update studio output
  const ALLOWED_UPDATE_FIELDS = ['title', 'content', 'source_ids', 'file_path', 'metadata', 'deck_id', 'resource_id'];

  ipcMain.handle('db:studio:update', (event, id, updates) => {
    try {
      validateSender(event, windowManager);
      const db = database.getDB();

      const existing = db.prepare('SELECT type FROM studio_outputs WHERE id = ?').get(id);
      if (!existing) {
        return { success: false, error: 'Studio output not found' };
      }

      const normalizedUpdates = { ...updates };
      if (Object.prototype.hasOwnProperty.call(updates, 'content')) {
        const contentValidation = validateStudioContentForPersist(existing.type, updates.content);
        if (!contentValidation.ok) {
          return {
            success: false,
            error: 'studio.validation_failed',
            errors: contentValidation.errors,
          };
        }
        normalizedUpdates.content = contentValidation.content;
      }

      const fields = [];
      const values = [];

      for (const key of Object.keys(normalizedUpdates)) {
        if (!ALLOWED_UPDATE_FIELDS.includes(key)) {
          continue;
        }
        fields.push(`${key} = ?`);
        if (key === 'source_ids' || key === 'metadata') {
          values.push(typeof normalizedUpdates[key] === 'string' ? normalizedUpdates[key] : JSON.stringify(normalizedUpdates[key]));
        } else {
          values.push(normalizedUpdates[key]);
        }
      }

      fields.push('updated_at = ?');
      values.push(Date.now());
      values.push(id);

      db.prepare(`UPDATE studio_outputs SET ${fields.join(', ')} WHERE id = ?`).run(...values);

      const updated = db.prepare('SELECT * FROM studio_outputs WHERE id = ?').get(id);
      return { success: true, data: updated };
    } catch (error) {
      console.error('[DB] Error updating studio output:', error);
      return { success: false, error: error.message };
    }
  });

  // Delete studio output (and linked flashcard deck if type=flashcards)
  ipcMain.handle('db:studio:delete', (event, id) => {
    try {
      validateSender(event, windowManager);
      const db = database.getDB();
      const row = db.prepare('SELECT deck_id FROM studio_outputs WHERE id = ?').get(id);
      if (row?.deck_id) {
        db.prepare('DELETE FROM flashcard_decks WHERE id = ?').run(row.deck_id);
        windowManager.broadcast('flashcard:deckDeleted', { id: row.deck_id });
      }
      db.prepare('DELETE FROM studio_outputs WHERE id = ?').run(id);
      return { success: true };
    } catch (error) {
      console.error('[DB] Error deleting studio output:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('studio:cancel', (event, runId) => {
    try {
      validateSender(event, windowManager);
      if (runId) cancelRun(runId);
      return { success: true };
    } catch (error) {
      console.error('[Studio] cancel error:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
