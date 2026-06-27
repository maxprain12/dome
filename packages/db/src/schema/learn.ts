import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const flashcardDecks = sqliteTable('flashcard_decks', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().default('default'),
  resourceId: text('resource_id'),
  title: text('title').notNull(),
  description: text('description'),
  metadataJson: text('metadata_json'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const flashcards = sqliteTable('flashcards', {
  id: text('id').primaryKey(),
  deckId: text('deck_id').notNull(),
  front: text('front').notNull(),
  back: text('back').notNull(),
  tags: text('tags'),
  metadataJson: text('metadata_json'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const flashcardSessions = sqliteTable('flashcard_sessions', {
  id: text('id').primaryKey(),
  deckId: text('deck_id').notNull(),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
  statsJson: text('stats_json'),
});

export const studioOutputs = sqliteTable('studio_outputs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().default('default'),
  resourceId: text('resource_id'),
  outputType: text('output_type').notNull(),
  title: text('title').notNull(),
  content: text('content'),
  metadataJson: text('metadata_json'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const quizRuns = sqliteTable('quiz_runs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().default('default'),
  resourceId: text('resource_id'),
  status: text('status').notNull(),
  score: integer('score'),
  answersJson: text('answers_json'),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
});

export const studyEvents = sqliteTable('study_events', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().default('default'),
  eventType: text('event_type').notNull(),
  payloadJson: text('payload_json'),
  createdAt: integer('created_at').notNull(),
});

export const learnKpisCache = sqliteTable('learn_kpis_cache', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().default('default'),
  kpiKey: text('kpi_key').notNull(),
  valueJson: text('value_json').notNull(),
  computedAt: integer('computed_at').notNull(),
});
