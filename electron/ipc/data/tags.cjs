/* eslint-disable no-console */
const crypto = require('crypto');

function register({ ipcMain, windowManager, database, validateSender }) {
  ipcMain.handle('db:tags:getByResource', (event, resourceId) => {
    try {
      validateSender(event, windowManager);
      const tagsRepo = database.getTagsRepo();
      const tags = tagsRepo.getByResource(resourceId);
      return { success: true, data: tags };
    } catch (error) {
      console.error('[DB] Error getting tags by resource:', error);
      return { success: false, error: error.message, data: [] };
    }
  });

  ipcMain.handle('db:tags:getAll', (event, projectId) => {
    try {
      validateSender(event, windowManager);
      const tagsRepo = database.getTagsRepo();
      const tags = tagsRepo.getAllWithCount(projectId);
      return { success: true, data: tags };
    } catch (error) {
      console.error('[DB] Error getting all tags:', error);
      return { success: false, error: error.message, data: [] };
    }
  });

  ipcMain.handle('db:tags:getResources', (event, tagId, projectId) => {
    try {
      validateSender(event, windowManager);
      const tagsRepo = database.getTagsRepo();
      const resources = tagsRepo.getResourcesByTag(tagId, projectId);
      return { success: true, data: resources };
    } catch (error) {
      console.error('[DB] Error getting resources by tag:', error);
      return { success: false, error: error.message, data: [] };
    }
  });

  ipcMain.handle('db:tags:create', (event, tag) => {
    try {
      validateSender(event, windowManager);
      const tagsRepo = database.getTagsRepo();
      const raw =
        typeof tag?.name === 'string' ? tag.name.trim().replace(/^#+/u, '').trim() : '';
      if (!raw) {
        return { success: false, error: 'Invalid tag name' };
      }
      const existing = tagsRepo.findByNameInsensitive(raw);
      if (existing) {
        return { success: true, data: existing };
      }
      const id = crypto.randomUUID();
      const now = Date.now();
      const color = typeof tag?.color === 'string' ? tag.color : null;
      tagsRepo.insert({ id, name: raw, color, createdAt: now });
      const created = tagsRepo.getById(id);
      return { success: true, data: created };
    } catch (error) {
      console.error('[DB] Error creating tag:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:tags:addToResource', (event, resourceId, tagId) => {
    try {
      validateSender(event, windowManager);
      database.getTagsRepo().attach(resourceId, tagId);
      return { success: true };
    } catch (error) {
      console.error('[DB] Error attaching tag:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:tags:removeFromResource', (event, resourceId, tagId) => {
    try {
      validateSender(event, windowManager);
      database.getTagsRepo().detach(resourceId, tagId);
      return { success: true };
    } catch (error) {
      console.error('[DB] Error detaching tag:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
