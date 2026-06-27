import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const calendarAccounts = sqliteTable('calendar_accounts', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  label: text('label'),
  credentialsJson: text('credentials_json'),
  enabled: integer('enabled').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const calendarCalendars = sqliteTable('calendar_calendars', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  externalId: text('external_id').notNull(),
  name: text('name').notNull(),
  color: text('color'),
  enabled: integer('enabled').notNull().default(1),
  metadataJson: text('metadata_json'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const calendarEvents = sqliteTable('calendar_events', {
  id: text('id').primaryKey(),
  calendarId: text('calendar_id').notNull(),
  externalId: text('external_id'),
  title: text('title').notNull(),
  description: text('description'),
  location: text('location'),
  startAt: integer('start_at').notNull(),
  endAt: integer('end_at'),
  allDay: integer('all_day').notNull().default(0),
  timezone: text('timezone'),
  recurrenceJson: text('recurrence_json'),
  reminders: text('reminders'),
  status: text('status'),
  metadataJson: text('metadata_json'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const calendarEventLinks = sqliteTable('calendar_event_links', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull(),
  linkType: text('link_type').notNull(),
  linkId: text('link_id').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const calendarNotifications = sqliteTable('calendar_notifications', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull(),
  fireAt: integer('fire_at').notNull(),
  status: text('status').notNull(),
  payloadJson: text('payload_json'),
  createdAt: integer('created_at').notNull(),
});
