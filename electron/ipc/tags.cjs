/* eslint-disable no-console */
const crypto = require('crypto');

function register({ ipcMain, windowManager, database, validateSender }) {
  ipcMain.handle('db:tags:getByResource', (event, resourceId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      if (!queries.getTagsByResource) {
        return { success: false, error: 'Tags not available', data: [] };
      }
      const tags = queries.getTagsByResource.all(resourceId);
      return { success: true, data: tags };
    } catch (error) {
      console.error('[DB] Error getting tags by resource:', error);
      return { success: false, error: error.message, data: [] };
    }
  });

  ipcMain.handle('db:tags:getAll', (event) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      if (!queries.getAllTagsWithCount) {
        return { success: false, error: 'Tags query not available', data: [] };
      }
      const tags = queries.getAllTagsWithCount.all();
      return { success: true, data: tags };
    } catch (error) {
      console.error('[DB] Error getting all tags:', error);
      return { success: false, error: error.message, data: [] };
    }
  });

  ipcMain.handle('db:tags:getResources', (event, tagId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      if (!queries.getResourcesByTag) {
        return { success: false, error: 'Resources by tag query not available', data: [] };
      }
      const resources = queries.getResourcesByTag.all(tagId);
      return { success: true, data: resources };
    } catch (error) {
      console.error('[DB] Error getting resources by tag:', error);
      return { success: false, error: error.message, data: [] };
    }
  });

  ipcMain.handle('db:tags:create', (event, tag) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      if (!queries.insertTag || !queries.findTagByNameInsensitive) {
        return { success: false, error: 'Tag mutations not available' };
      }
      const raw =
        typeof tag?.name === 'string' ? tag.name.trim().replace(/^#+/u, '').trim() : '';
      if (!raw) {
        return { success: false, error: 'Invalid tag name' };
      }
      const existing = queries.findTagByNameInsensitive.get(raw);
      if (existing) {
        return { success: true, data: existing };
      }
      const id = crypto.randomUUID();
      const now = Date.now();
      const color = typeof tag?.color === 'string' ? tag.color : null;
      queries.insertTag.run(id, raw, color, now);
      const created = queries.getTagById.get(id);
      return { success: true, data: created };
    } catch (error) {
      console.error('[DB] Error creating tag:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:tags:addToResource', (event, resourceId, tagId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      if (!queries.attachTagToResource) {
        return { success: false, error: 'Tag attach not available' };
      }
      queries.attachTagToResource.run(resourceId, tagId);
      return { success: true };
    } catch (error) {
      console.error('[DB] Error attaching tag:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:tags:removeFromResource', (event, resourceId, tagId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      if (!queries.detachTagFromResource) {
        return { success: false, error: 'Tag detach not available' };
      }
      queries.detachTagFromResource.run(resourceId, tagId);
      return { success: true };
    } catch (error) {
      console.error('[DB] Error detaching tag:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
