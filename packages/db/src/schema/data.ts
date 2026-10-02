import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
