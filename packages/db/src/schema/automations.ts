import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const automationDefinitions = sqliteTable('automation_definitions', {
  id: text('id').primaryKey(),
  projectId: text('project_id'),
  title: text('title').notNull(),
  description: text('description'),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  triggerType: text('trigger_type').notNull(),
  scheduleJson: text('schedule_json'),
  inputTemplateJson: text('input_template_json'),
  outputMode: text('output_mode').notNull().default('chat_only'),
  enabled: integer('enabled').notNull().default(0),
  legacySource: text('legacy_source'),
  lastRunAt: integer('last_run_at'),
  lastRunStatus: text('last_run_status'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const automationRuns = sqliteTable('automation_runs', {
  id: text('id').primaryKey(),
  automationId: text('automation_id'),
  ownerType: text('owner_type').notNull(),
  ownerId: text('owner_id').notNull(),
  projectId: text('project_id'),
  title: text('title'),
  status: text('status').notNull(),
  sessionId: text('session_id'),
  workflowId: text('workflow_id'),
  workflowExecutionId: text('workflow_execution_id'),
  threadId: text('thread_id'),
  outputText: text('output_text'),
  summary: text('summary'),
  error: text('error'),
  metadata: text('metadata'),
  startedAt: integer('started_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  finishedAt: integer('finished_at'),
  lastHeartbeatAt: integer('last_heartbeat_at'),
});

export const automationRunSteps = sqliteTable('automation_run_steps', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  parentStepId: text('parent_step_id'),
  stepType: text('step_type').notNull(),
  title: text('title').notNull(),
  status: text('status').notNull().default('done'),
  content: text('content'),
  metadata: text('metadata'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const automationRunLinks = sqliteTable('automation_run_links', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  linkType: text('link_type').notNull(),
  linkId: text('link_id').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const chatSessions = sqliteTable('chat_sessions', {
  id: text('id').primaryKey(),
  projectId: text('project_id'),
  title: text('title'),
  surface: text('surface'),
  agentId: text('agent_id'),
  metadata: text('metadata'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const chatMessages = sqliteTable('chat_messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  role: text('role').notNull(),
  content: text('content'),
  toolCalls: text('tool_calls'),
  thinking: text('thinking'),
  metadata: text('metadata'),
  createdAt: integer('created_at').notNull(),
});

export const chatTraces = sqliteTable('chat_traces', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  messageId: text('message_id'),
  traceJson: text('trace_json'),
  createdAt: integer('created_at').notNull(),
});
