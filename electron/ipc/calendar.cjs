/* eslint-disable no-console */
/**
 * IPC handlers for calendar operations
 */

const calendarService = require('../calendar-service.cjs');
const googleCalendarService = require('../google-calendar-service.cjs');
const calendarImportService = require('../calendar-import-service.cjs');

function register({ ipcMain, windowManager, validateSender, sanitizePath }) {
  ipcMain.handle('calendar:connectGoogle', async (event) => {
    try {
      validateSender(event, windowManager);
      const result = await googleCalendarService.startOAuthFlow();
      return { success: true, accountId: result.accountId };
    } catch (err) {
      console.error('[Calendar IPC] connectGoogle error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('calendar:getGoogleAccounts', async (event) => {
    try {
      validateSender(event, windowManager);
      return calendarService.getGoogleAccounts();
    } catch (err) {
      console.error('[Calendar IPC] getGoogleAccounts error:', err);
      return { success: false, error: err.message, accounts: [] };
    }
  });

  ipcMain.handle('calendar:listCalendars', async (event, accountId) => {
    try {
      validateSender(event, windowManager);
      return calendarService.listCalendars(accountId ?? null);
    } catch (err) {
      console.error('[Calendar IPC] listCalendars error:', err);
      return { success: false, error: err.message, calendars: [] };
    }
  });

  ipcMain.handle('calendar:listEvents', async (event, params) => {
    try {
      validateSender(event, windowManager);
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid params', events: [] };
      }
      const { startMs, endMs, calendarIds } = params;
      if (typeof startMs !== 'number' || typeof endMs !== 'number') {
        return { success: false, error: 'startMs and endMs must be numbers', events: [] };
      }
      const result = await calendarService.listEvents(startMs, endMs, { calendarIds });
      if (result.success) {
        windowManager.broadcast('calendar:eventsUpdated', {});
      }
      return result;
    } catch (err) {
      console.error('[Calendar IPC] listEvents error:', err);
      return { success: false, error: err.message, events: [] };
    }
  });

  ipcMain.handle('calendar:createEvent', async (event, data) => {
    try {
      validateSender(event, windowManager);
      const result = await calendarService.createEvent(data);
      if (result.success && result.event) {
        windowManager.broadcast('calendar:eventCreated', result.event);
      }
      return result;
    } catch (err) {
      console.error('[Calendar IPC] createEvent error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('calendar:updateEvent', async (event, eventId, updates) => {
    try {
      validateSender(event, windowManager);
      const result = await calendarService.updateEvent(eventId, updates);
      if (result.success && result.event) {
        windowManager.broadcast('calendar:eventUpdated', result.event);
      }
      return result;
    } catch (err) {
      console.error('[Calendar IPC] updateEvent error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('calendar:deleteEvent', async (event, eventId) => {
    try {
      validateSender(event, windowManager);
      const result = await calendarService.deleteEvent(eventId);
      if (result.success) {
        windowManager.broadcast('calendar:eventDeleted', { id: eventId });
      }
      return result;
    } catch (err) {
      console.error('[Calendar IPC] deleteEvent error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('calendar:syncNow', async (event) => {
    try {
      validateSender(event, windowManager);
      const result = await calendarService.syncNow();
      if (result.success) {
        windowManager.broadcast('calendar:syncStatus', {
          status: 'idle',
          lastSync: Date.now(),
          manual: true,
        });
      } else {
        windowManager.broadcast('calendar:syncStatus', {
          status: 'error',
          error: result.error || 'Sync failed',
          manual: true,
        });
      }
      return result;
    } catch (err) {
      console.error('[Calendar IPC] syncNow error:', err);
      windowManager.broadcast('calendar:syncStatus', {
        status: 'error',
        error: err.message,
        manual: true,
      });
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('calendar:getSettings', async (event) => {
    try {
      validateSender(event, windowManager);
      return calendarService.getCalendarSettings();
    } catch (err) {
      console.error('[Calendar IPC] getSettings error:', err);
      return { success: false, error: err.message, settings: {} };
    }
  });

  ipcMain.handle('calendar:setSettings', async (event, partial) => {
    try {
      validateSender(event, windowManager);
      return calendarService.setCalendarSettings(partial || {});
    } catch (err) {
      console.error('[Calendar IPC] setSettings error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('calendar:setCalendarSelected', async (event, calendarId, isSelected) => {
    try {
      validateSender(event, windowManager);
      return calendarService.setCalendarSelected(calendarId, !!isSelected);
    } catch (err) {
      console.error('[Calendar IPC] setCalendarSelected error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('calendar:disconnectGoogle', async (event, accountId) => {
    try {
      validateSender(event, windowManager);
      return calendarService.disconnectGoogleAccount(accountId);
    } catch (err) {
      console.error('[Calendar IPC] disconnectGoogle error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('calendar:previewIcs', async (event, filePath) => {
    try {
      validateSender(event, windowManager);
      if (typeof filePath !== 'string' || !filePath) {
        return { success: false, error: 'Invalid path', events: [], rawCount: 0 };
      }
      const safe = sanitizePath(filePath, true);
      const preview = calendarImportService.previewIcsFile(safe);
      return { success: true, ...preview };
    } catch (err) {
      console.error('[Calendar IPC] previewIcs error:', err);
      return { success: false, error: err.message, events: [], rawCount: 0 };
    }
  });

  ipcMain.handle('calendar:importIcs', async (event, filePath, calendarId, options) => {
    try {
      validateSender(event, windowManager);
      if (typeof filePath !== 'string' || typeof calendarId !== 'string') {
        return { success: false, error: 'Invalid arguments', imported: 0, skipped: 0 };
      }
      const safe = sanitizePath(filePath, true);
      const result = await calendarImportService.importIcsFile(safe, calendarId, options || {});
      windowManager.broadcast('calendar:eventsUpdated', {});
      return { success: true, ...result };
    } catch (err) {
      console.error('[Calendar IPC] importIcs error:', err);
      return { success: false, error: err.message, imported: 0, skipped: 0 };
    }
  });

  ipcMain.handle('calendar:getUpcoming', async (event, params) => {
    try {
      validateSender(event, windowManager);
      const windowMinutes = typeof params?.windowMinutes === 'number' && params.windowMinutes > 0 ? params.windowMinutes : 60;
      const limit = typeof params?.limit === 'number' && params.limit > 0 ? params.limit : 20;
      return await calendarService.getUpcomingEvents(windowMinutes, limit);
    } catch (err) {
      console.error('[Calendar IPC] getUpcoming error:', err);
      return { success: false, error: err.message, events: [] };
    }
  });
}

module.exports = { register };
