/* eslint-disable no-console */
function register({ ipcMain, windowManager, notebookPython }) {
  /**
   * Run Python code in notebook (main process subprocess)
   */
  ipcMain.handle('notebook:runPython', async (event, { code, cells, targetCellIndex, cwd }) => {
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
}

module.exports = { register };
