import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Per-domain cursor + enabled flag for Domain Sync v1 (device state, never synced). */
export const domainSyncState = sqliteTable('domain_sync_state', {
  domain: text('domain').primaryKey(),
  lastPullCursor: text('last_pull_cursor').notNull().default('0'),
  lastPushAt: integer('last_push_at').notNull().default(0),
  enabled: integer('enabled').notNull().default(1),
  updatedAt: integer('updated_at').notNull(),
});

/** Local queue of deletions pending push (device state, never synced). */
export const syncTombstones = sqliteTable(
  'sync_tombstones',
  {
    tableName: text('table_name').notNull(),
    rowId: text('row_id').notNull(),
    deletedAt: integer('deleted_at').notNull(),
    synced: integer('synced').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.tableName, t.rowId] })],
);

/** Mirror of the allowlisted settings synced through the `settings` domain. */
export const syncedSettings = sqliteTable('synced_settings', {
  id: text('id').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deviceId: text('device_id'),
  deletedAt: integer('deleted_at'),
});

/** Content-addressed vault blob manifest (files sync domain). */
export const vaultBlobs = sqliteTable('vault_blobs', {
  id: text('id').primaryKey(),
  hash: text('hash').notNull().unique(),
  sizeBytes: integer('size_bytes').notNull().default(0),
  mime: text('mime'),
  originalName: text('original_name'),
  uploadState: text('upload_state').notNull().default('pending'),
  localState: text('local_state').notNull().default('present'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** Manifest of Many JSONL session files (conversations sync domain). */
export const manySessionIndex = sqliteTable('many_session_index', {
  id: text('id').primaryKey(),
  title: text('title'),
  agentId: text('agent_id'),
  relPath: text('rel_path').notNull().default(''),
  hash: text('hash').notNull(),
  sizeBytes: integer('size_bytes').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
