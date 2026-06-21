/* eslint-disable no-console */
const crypto = require('crypto');

function register({ ipcMain, windowManager, database, validateSender }) {
  ipcMain.handle('db:tags:getByResource', async (event, resourceId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      if (!queries.getTagsByResource) {
        return { success: false, error: 'Tags not available', data: [] };
      }
      const tags = await queries.getTagsByResource.all(resourceId);
      return { success: true, data: tags };
    } catch (error) {
      console.error('[DB] Error getting tags by resource:', error);
      return { success: false, error: error.message, data: [] };
    }
  });

  ipcMain.handle('db:tags:getAll', async (event, projectId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      if (!queries.getAllTagsWithCount) {
        return { success: false, error: 'Tags query not available', data: [] };
      }
      // Hard-scope to the active project so tags never leak across projects.
      const tags =
        typeof projectId === 'string' && projectId
          ? await queries.getAllTagsWithCountByProject.all(projectId)
          : await queries.getAllTagsWithCount.all();
      return { success: true, data: tags };
    } catch (error) {
      console.error('[DB] Error getting all tags:', error);
      return { success: false, error: error.message, data: [] };
    }
  });

  ipcMain.handle('db:tags:getResources', async (event, tagId, projectId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      if (!queries.getResourcesByTag) {
        return { success: false, error: 'Resources by tag query not available', data: [] };
      }
      const resources =
        typeof projectId === 'string' && projectId
          ? await queries.getResourcesByTagInProject.all(tagId, projectId)
          : await queries.getResourcesByTag.all(tagId);
      return { success: true, data: resources };
    } catch (error) {
      console.error('[DB] Error getting resources by tag:', error);
      return { success: false, error: error.message, data: [] };
    }
  });

  ipcMain.handle('db:tags:create', async (event, tag) => {
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
      const existing = await queries.findTagByNameInsensitive.get(raw);
      if (existing) {
        return { success: true, data: existing };
      }
      const id = crypto.randomUUID();
      const now = Date.now();
      const color = typeof tag?.color === 'string' ? tag.color : null;
      await queries.insertTag.run(id, raw, color, now);
      const created = await queries.getTagById.get(id);
      return { success: true, data: created };
    } catch (error) {
      console.error('[DB] Error creating tag:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:tags:addToResource', async (event, resourceId, tagId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      if (!queries.attachTagToResource) {
        return { success: false, error: 'Tag attach not available' };
      }
      await queries.attachTagToResource.run(resourceId, tagId);
      return { success: true };
    } catch (error) {
      console.error('[DB] Error attaching tag:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:tags:removeFromResource', async (event, resourceId, tagId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      if (!queries.detachTagFromResource) {
        return { success: false, error: 'Tag detach not available' };
      }
      await queries.detachTagFromResource.run(resourceId, tagId);
      return { success: true };
    } catch (error) {
      console.error('[DB] Error detaching tag:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
