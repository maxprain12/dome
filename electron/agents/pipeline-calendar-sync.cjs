/* eslint-disable no-console */

/**
 * Pipeline → Calendar one-way mirror.
 *
 * When a pipeline_item has both start_at and end_at, a local calendar_events
 * row is created/updated so the milestone shows up in the existing calendar UI
 * (no calendar UI changes needed). The link is stored in
 * pipeline_items.calendar_event_id. Clearing the dates or deleting the item
 * removes the mirrored event. Pattern mirrors artifact-sink.cjs.
 */

const database = require('../core/database.cjs');
const calendarService = require('../calendar/calendar-service.cjs');

function queries() {
  return database.getQueries();
}

/**
 * Reconcile the calendar event for an item row (snake_case DB row).
 * Returns the (possibly updated) calendar_event_id.
 */
async function syncItemCalendar(itemRow) {
  if (!itemRow) return null;
  const q = queries();
  const hasDates = itemRow.start_at != null && itemRow.end_at != null;
  const eventId = itemRow.calendar_event_id || null;

  try {
    if (hasDates) {
      if (eventId) {
        await calendarService.updateEvent(eventId, {
          title: itemRow.title,
          start_at: itemRow.start_at,
          end_at: itemRow.end_at,
        });
        return eventId;
      }
      const res = await calendarService.createEvent({
        title: itemRow.title,
        start_at: itemRow.start_at,
        end_at: itemRow.end_at,
        metadata: { source: 'pipeline', pipelineItemId: itemRow.id, pipelineId: itemRow.pipeline_id },
      });
      if (res?.success && res.event?.id) {
        q.updatePipelineItemCalendar.run(res.event.id, Date.now(), itemRow.id);
        return res.event.id;
      }
      return null;
    }

    // No dates → remove any mirrored event.
    if (eventId) {
      await calendarService.deleteEvent(eventId);
      q.updatePipelineItemCalendar.run(null, Date.now(), itemRow.id);
    }
    return null;
  } catch (e) {
    console.warn('[PipelineCalendarSync] sync failed:', e?.message);
    return eventId;
  }
}

/** Delete the mirrored event when an item is removed. */
async function removeItemCalendar(itemRow) {
  if (!itemRow?.calendar_event_id) return;
  try {
    await calendarService.deleteEvent(itemRow.calendar_event_id);
  } catch (e) {
    console.warn('[PipelineCalendarSync] remove failed:', e?.message);
  }
}

module.exports = { syncItemCalendar, removeItemCalendar };
