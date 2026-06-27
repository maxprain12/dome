import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  parentId: text('parent_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  color: text('color'),
  createdAt: integer('created_at').notNull(),
});

export const resourceTags = sqliteTable(
  'resource_tags',
  {
    resourceId: text('resource_id').notNull(),
    tagId: text('tag_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.resourceId, t.tagId] })],
);

export const resources = sqliteTable('resources', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  content: text('content'),
  filePath: text('file_path'),
  internalPath: text('internal_path'),
  fileMimeType: text('file_mime_type'),
  fileSize: integer('file_size'),
  fileHash: text('file_hash'),
  thumbnailData: text('thumbnail_data'),
  originalFilename: text('original_filename'),
  folderId: text('folder_id'),
  metadata: text('metadata'),
  vaultPath: text('vault_path'),
  contentText: text('content_text'),
  contentHash: text('content_hash'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const sources = sqliteTable('sources', {
  id: text('id').primaryKey(),
  resourceId: text('resource_id'),
  type: text('type').notNull(),
  title: text('title').notNull(),
  authors: text('authors'),
  year: integer('year'),
  doi: text('doi'),
  url: text('url'),
  publisher: text('publisher'),
  journal: text('journal'),
  volume: text('volume'),
  issue: text('issue'),
  pages: text('pages'),
  isbn: text('isbn'),
  metadata: text('metadata'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const resourceInteractions = sqliteTable('resource_interactions', {
  id: text('id').primaryKey(),
  resourceId: text('resource_id').notNull(),
  type: text('type').notNull(),
  content: text('content').notNull(),
  positionData: text('position_data'),
  metadata: text('metadata'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const searchIndex = sqliteTable('search_index', {
  id: text('id').primaryKey(),
  resourceId: text('resource_id').notNull().unique(),
  combinedText: text('combined_text'),
  keywords: text('keywords'),
  lastIndexed: integer('last_indexed').notNull(),
});

export const artifacts = sqliteTable('artifacts', {
  id: text('id').primaryKey(),
  resourceId: text('resource_id').notNull().unique(),
  artifactType: text('artifact_type').notNull(),
  template: text('template'),
  state: text('state').notNull().default('{}'),
  linkedResourceId: text('linked_resource_id'),
  version: integer('version').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
