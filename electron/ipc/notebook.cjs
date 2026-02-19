/* eslint-disable no-console */
function register({ ipcMain, windowManager, notebookPython }) {
  /**
   * Run Python code in notebook (main process subprocess)
   */
  ipcMain.handle('notebook:runPython', async (event, { code, cells, targetCellIndex, cwd, venvPath }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, outputs: [], error: 'Unauthorized' };
    }

    if (!notebookPython) {
      return {
        success: false,
        outputs: [{
          output_type: 'error',
          ename: 'RuntimeError',
          evalue: 'Notebook Python service not available',
          traceback: [],
        }],
        error: 'Service not available',
      };
    }

    try {
      if (typeof code !== 'string') {
        return {
          success: false,
          outputs: [{
            output_type: 'error',
            ename: 'TypeError',
            evalue: 'Code must be a string',
            traceback: [],
          }],
          error: 'Invalid code',
        };
      }
      const options = {};
      if (Array.isArray(cells) && typeof targetCellIndex === 'number' && targetCellIndex >= 0) {
        options.cells = cells;
        options.targetCellIndex = targetCellIndex;
      }
      if (typeof cwd === 'string' && cwd.trim()) {
        options.cwd = cwd.trim();
      }
      if (typeof venvPath === 'string' && venvPath.trim()) {
        options.venvPath = venvPath.trim();
      }
      return await notebookPython.runPythonCode(code, options);
    } catch (error) {
      console.error('[Notebook] runPython error:', error);
      return {
        success: false,
        outputs: [{
          output_type: 'error',
          ename: 'Error',
          evalue: error.message || 'Failed to run Python',
          traceback: (error.stack || error.message || '').split('\n').filter(Boolean),
        }],
        error: error.message,
      };
    }
  });

  /**
   * Check if Python is available on the system
   */
  ipcMain.handle('notebook:checkPython', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { available: false };
    }

    if (!notebookPython) {
      return { available: false };
    }

    try {
      return await notebookPython.checkPython();
    } catch (error) {
      console.error('[Notebook] checkPython error:', error);
      return { available: false };
    }
  });

  /**
   * Create a Python venv at basePath/.venv
   */
  ipcMain.handle('notebook:createVenv', async (event, { basePath }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!notebookPython) {
      return { success: false, error: 'Notebook Python service not available' };
    }
    try {
      return await notebookPython.createVenv(basePath);
    } catch (error) {
      console.error('[Notebook] createVenv error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Install packages in a venv via pip
   */
  ipcMain.handle('notebook:pipInstall', async (event, { venvPath, packages }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!notebookPython) {
      return { success: false, error: 'Notebook Python service not available' };
    }
    try {
      return await notebookPython.pipInstall(venvPath, packages);
    } catch (error) {
      console.error('[Notebook] pipInstall error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Check if a path is a valid venv
   */
  ipcMain.handle('notebook:checkVenv', async (event, { venvPath }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { valid: false, error: 'Unauthorized' };
    }
    if (!notebookPython) {
      return { valid: false, error: 'Notebook Python service not available' };
    }
    try {
      return await notebookPython.checkVenv(venvPath);
    } catch (error) {
      console.error('[Notebook] checkVenv error:', error);
      return { valid: false, error: error.message };
    }
  });

  /**
   * List installed packages in a venv
   */
  ipcMain.handle('notebook:pipList', async (event, { venvPath }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!notebookPython) {
      return { success: false, error: 'Notebook Python service not available' };
    }
    try {
      return await notebookPython.pipList(venvPath);
    } catch (error) {
      console.error('[Notebook] pipList error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Install packages from requirements.txt
   */
  ipcMain.handle('notebook:pipInstallFromRequirements', async (event, { venvPath, requirementsPath }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!notebookPython) {
      return { success: false, error: 'Notebook Python service not available' };
    }
    try {
      return await notebookPython.pipInstallFromRequirements(venvPath, requirementsPath);
    } catch (error) {
      console.error('[Notebook] pipInstallFromRequirements error:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
