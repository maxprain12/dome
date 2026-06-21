/* eslint-disable no-console */
const { getLearnKpisCached, getLearnStreakCached } = require('../../services/learn-kpis.cjs');

function register({ ipcMain, windowManager, database, validateSender }) {
  ipcMain.handle('learn:getKpis', async (event) => {
    try {
      validateSender(event, windowManager);
      const db = database.getDB();
      const data = await getLearnKpisCached(db);
      return { success: true, data };
    } catch (error) {
      console.error('[Learn] getKpis error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('learn:getStreak', async (event) => {
    try {
      validateSender(event, windowManager);
      const db = database.getDB();
      const data = await getLearnStreakCached(db);
      return { success: true, data };
    } catch (error) {
      console.error('[Learn] getStreak error:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
