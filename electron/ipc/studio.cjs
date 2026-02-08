/* eslint-disable no-console */
const crypto = require('crypto');

function generateId() {
  return crypto.randomUUID();
}

function register({ ipcMain, windowManager, database, validateSender }) {
  // Create studio output
  ipcMain.handle('db:studio:create', (event, data) => {
    try {
      validateSender(event, windowManager);
      const db = database.getDB();
      const id = data.id || generateId();
      const now = Date.now();

      const stmt = db.prepare(`
        INSERT INTO studio_outputs (id, project_id, type, title, content, source_ids, file_path, metadata, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        data.project_id,
        data.type,
        data.title,
        data.content || null,
        data.source_ids ? JSON.stringify(data.source_ids) : null,
        data.file_path || null,
        data.metadata ? JSON.stringify(data.metadata) : null,
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

  // Get studio outputs by project
  ipcMain.handle('db:studio:getByProject', (event, projectId) => {
    try {
      validateSender(event, windowManager);
      const db = database.getDB();
      const stmt = db.prepare('SELECT * FROM studio_outputs WHERE project_id = ? ORDER BY updated_at DESC');
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
  ipcMain.handle('db:studio:update', (event, id, updates) => {
    try {
      validateSender(event, windowManager);
      const db = database.getDB();
      const fields = [];
      const values = [];

      if (updates.title !== undefined) {
        fields.push('title = ?');
        values.push(updates.title);
      }
      if (updates.content !== undefined) {
        fields.push('content = ?');
        values.push(updates.content);
      }
      if (updates.source_ids !== undefined) {
        fields.push('source_ids = ?');
        values.push(typeof updates.source_ids === 'string' ? updates.source_ids : JSON.stringify(updates.source_ids));
      }
      if (updates.file_path !== undefined) {
        fields.push('file_path = ?');
        values.push(updates.file_path);
      }
      if (updates.metadata !== undefined) {
        fields.push('metadata = ?');
        values.push(typeof updates.metadata === 'string' ? updates.metadata : JSON.stringify(updates.metadata));
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

  // Delete studio output
  ipcMain.handle('db:studio:delete', (event, id) => {
    try {
      validateSender(event, windowManager);
      const db = database.getDB();
      db.prepare('DELETE FROM studio_outputs WHERE id = ?').run(id);
      return { success: true };
    } catch (error) {
      console.error('[DB] Error deleting studio output:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
