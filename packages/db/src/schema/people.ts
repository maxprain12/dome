import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const people = sqliteTable('people', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().default('default'),
  displayName: text('display_name').notNull(),
  primaryEmail: text('primary_email'),
  avatarUrl: text('avatar_url'),
  notes: text('notes'),
  leadStatus: text('lead_status').notNull().default('lead'),
  profileJson: text('profile_json'),
  discoveredVia: text('discovered_via'),
  firstSeenAt: integer('first_seen_at'),
  lastSeenAt: integer('last_seen_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const personIdentities = sqliteTable(
  'person_identities',
  {
    id: text('id').primaryKey(),
    personId: text('person_id').notNull(),
    projectId: text('project_id').notNull().default('default'),
    source: text('source').notNull(),
    externalId: text('external_id').notNull(),
    displayLabel: text('display_label'),
    metaJson: text('meta_json'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    projectSourceExt: uniqueIndex('person_identities_project_source_ext').on(
      table.projectId,
      table.source,
      table.externalId,
    ),
  }),
);

export const personInteractions = sqliteTable('person_interactions', {
  id: text('id').primaryKey(),
  personId: text('person_id').notNull(),
  projectId: text('project_id').notNull().default('default'),
  kind: text('kind').notNull(),
  refType: text('ref_type'),
  refId: text('ref_id'),
  summary: text('summary'),
  payload: text('payload'),
  occurredAt: integer('occurred_at').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
