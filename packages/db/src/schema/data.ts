import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const resourceChunks = sqliteTable('resource_chunks', {
  id: text('id').primaryKey(),
  resourceId: text('resource_id').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  text: text('text').notNull(),
  embedding: blob('embedding').notNull(),
  modelVersion: text('model_version').notNull(),
  charStart: integer('char_start'),
  charEnd: integer('char_end'),
  pageNumber: integer('page_number'),
  updatedAt: integer('updated_at').notNull(),
});

export const semanticRelations = sqliteTable('semantic_relations', {
  id: text('id').primaryKey(),
  sourceId: text('source_id').notNull(),
  targetId: text('target_id').notNull(),
  similarity: integer('similarity').notNull(),
  relationType: text('relation_type').notNull(),
  label: text('label'),
  detectedAt: integer('detected_at').notNull(),
  confirmedAt: integer('confirmed_at'),
});

export const resourceTranscripts = sqliteTable('resource_transcripts', {
  id: text('id').primaryKey(),
  resourceId: text('resource_id').notNull(),
  language: text('language'),
  text: text('text'),
  segmentsJson: text('segments_json'),
  source: text('source'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const transcriptionSessions = sqliteTable('transcription_sessions', {
  id: text('id').primaryKey(),
  resourceId: text('resource_id').notNull(),
  status: text('status').notNull(),
  language: text('language'),
  metadataJson: text('metadata_json'),
  startedAt: integer('started_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  finishedAt: integer('finished_at'),
});

export const transcriptionChunks = sqliteTable('transcription_chunks', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  text: text('text'),
  startMs: integer('start_ms'),
  endMs: integer('end_ms'),
  createdAt: integer('created_at').notNull(),
});

export const artifactRuntimeData = sqliteTable('artifact_runtime_data', {
  id: text('id').primaryKey(),
  artifactId: text('artifact_id').notNull(),
  dataJson: text('data_json'),
  updatedAt: integer('updated_at').notNull(),
});

export const automationArtifactBindings = sqliteTable('automation_artifact_bindings', {
  id: text('id').primaryKey(),
  automationId: text('automation_id').notNull(),
  artifactResourceId: text('artifact_resource_id').notNull(),
  jsonPath: text('json_path'),
  mergeMode: text('merge_mode').notNull().default('replace'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const domeCloudSync = sqliteTable('dome_cloud_sync', {
  id: text('id').primaryKey(),
  resourceId: text('resource_id').notNull(),
  remotePath: text('remote_path'),
  remoteHash: text('remote_hash'),
  localHash: text('local_hash'),
  syncStatus: text('sync_status').notNull(),
  lastSyncedAt: integer('last_synced_at'),
  metadataJson: text('metadata_json'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const feeders = sqliteTable('feeders', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().default('default'),
  name: text('name').notNull(),
  type: text('type').notNull(),
  configJson: text('config_json'),
  enabled: integer('enabled').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const feederSecrets = sqliteTable('feeder_secrets', {
  id: text('id').primaryKey(),
  feederId: text('feeder_id').notNull(),
  key: text('key').notNull(),
  secret: text('secret').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const feederRuns = sqliteTable('feeder_runs', {
  id: text('id').primaryKey(),
  feederId: text('feeder_id').notNull(),
  status: text('status').notNull(),
  output: text('output'),
  metadata: text('metadata'),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
});

export const emailAccounts = sqliteTable('email_accounts', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  imapHost: text('imap_host').notNull(),
  imapPort: integer('imap_port').notNull().default(993),
  imapEncryption: text('imap_encryption').notNull().default('tls'),
  smtpHost: text('smtp_host').notNull(),
  smtpPort: integer('smtp_port').notNull().default(465),
  smtpEncryption: text('smtp_encryption').notNull().default('tls'),
  username: text('username').notNull(),
  secret: text('secret').notNull(),
  isDefault: integer('is_default').notNull().default(0),
  status: text('status').notNull().default('active'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
