/* eslint-disable no-console */
const { getLearnKpis, getLearnStreak } = require('../services/learn-kpis.cjs');

function register({ ipcMain, windowManager, database, validateSender }) {
  ipcMain.handle('learn:getKpis', (event) => {
    try {
      validateSender(event, windowManager);
      const db = database.getDB();
      const data = getLearnKpis(db);
      return { success: true, data };
    } catch (error) {
      console.error('[Learn] getKpis error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('learn:getStreak', (event) => {
    try {
      validateSender(event, windowManager);
      const db = database.getDB();
      const data = getLearnStreak(db);
      return { success: true, data };
    } catch (error) {
      console.error('[Learn] getStreak error:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
