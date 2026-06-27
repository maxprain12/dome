import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const pipelines = sqliteTable('pipelines', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().default('default'),
  name: text('name').notNull(),
  description: text('description'),
  iconIndex: integer('icon_index').notNull().default(0),
  color: text('color'),
  folderId: text('folder_id'),
  archived: integer('archived').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const pipelineStages = sqliteTable('pipeline_stages', {
  id: text('id').primaryKey(),
  pipelineId: text('pipeline_id').notNull(),
  projectId: text('project_id').notNull().default('default'),
  title: text('title').notNull(),
  position: integer('position').notNull().default(0),
  executionPolicy: text('execution_policy').notNull().default('manual_resolve'),
  assignedAgentId: text('assigned_agent_id'),
  assignedWorkflowId: text('assigned_workflow_id'),
  runInputTemplate: text('run_input_template'),
  provider: text('provider'),
  model: text('model'),
  isTerminal: integer('is_terminal').notNull().default(0),
  wipLimit: integer('wip_limit'),
  configJson: text('config_json'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const pipelineSources = sqliteTable('pipeline_sources', {
  id: text('id').primaryKey(),
  pipelineId: text('pipeline_id').notNull(),
  projectId: text('project_id').notNull().default('default'),
  name: text('name').notNull(),
  sourceType: text('source_type').notNull(),
  configJson: text('config_json'),
  targetStageId: text('target_stage_id'),
  enabled: integer('enabled').notNull().default(1),
  lastSyncAt: integer('last_sync_at'),
  lastSyncStatus: text('last_sync_status'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const pipelineItems = sqliteTable('pipeline_items', {
  id: text('id').primaryKey(),
  pipelineId: text('pipeline_id').notNull(),
  projectId: text('project_id').notNull().default('default'),
  stageId: text('stage_id').notNull(),
  sourceId: text('source_id'),
  title: text('title').notNull(),
  position: integer('position').notNull().default(0),
  dataJson: text('data_json'),
  execStatus: text('exec_status').notNull().default('pending'),
  assignedKind: text('assigned_kind').notNull().default('unassigned'),
  assignedAgentId: text('assigned_agent_id'),
  currentRunId: text('current_run_id'),
  lastOutput: text('last_output'),
  startAt: integer('start_at'),
  endAt: integer('end_at'),
  calendarEventId: text('calendar_event_id'),
  metadataJson: text('metadata_json'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const pipelineItemEvents = sqliteTable('pipeline_item_events', {
  id: text('id').primaryKey(),
  itemId: text('item_id').notNull(),
  eventType: text('event_type').notNull(),
  payloadJson: text('payload_json'),
  createdAt: integer('created_at').notNull(),
});
