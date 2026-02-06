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

    const content = personalityLoader.readContextFile(filename);
    return { success: true, data: content };
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

    return { success: true, data: personalityLoader.listContextFiles() };
  });
}

module.exports = { register };
