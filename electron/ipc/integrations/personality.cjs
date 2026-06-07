/* eslint-disable no-console */
function register({ ipcMain, windowManager, personalityLoader }) {
  ipcMain.handle('personality:get-prompt', (event, params) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const prompt = personalityLoader.buildSystemPrompt(params || {});
      return { success: true, data: prompt };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('personality:read-file', (event, filename) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const content = personalityLoader.readContextFile(filename);
      return { success: true, data: content };
    } catch (error) {
      console.error('[Personality] read-file error:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('personality:write-file', (event, { filename, content }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      personalityLoader.writeContextFile(filename, content);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('personality:add-memory', (event, entry) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      personalityLoader.addMemoryEntry(entry);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('personality:list-files', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      return { success: true, data: personalityLoader.listContextFiles() };
    } catch (error) {
      console.error('[Personality] list-files error:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('personality:remember-fact', (event, { key, value }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      personalityLoader.updateLongTermMemory(key, value);
      personalityLoader.addMemoryEntry(`**${key}**: ${value}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
