/* eslint-disable no-console */
/**
 * IPC handlers for calendar operations
 */

const calendarService = require('../calendar-service.cjs');
const googleCalendarService = require('../google-calendar-service.cjs');

function register({ ipcMain, windowManager, validateSender }) {
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

  ipcMain.handle('calendar:listEvents', async (event, { startMs, endMs, calendarIds }) => {
    try {
      validateSender(event, windowManager);
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
        windowManager.broadcast('calendar:syncStatus', { status: 'idle', lastSync: Date.now() });
      }
      return result;
    } catch (err) {
      console.error('[Calendar IPC] syncNow error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('calendar:getUpcoming', async (event, { windowMinutes, limit }) => {
    try {
      validateSender(event, windowManager);
      return await calendarService.getUpcomingEvents(windowMinutes ?? 60, limit ?? 20);
    } catch (err) {
      console.error('[Calendar IPC] getUpcoming error:', err);
      return { success: false, error: err.message, events: [] };
    }
  });
}

module.exports = { register };
