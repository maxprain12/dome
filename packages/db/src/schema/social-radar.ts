import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const socialReferenceMetrics = sqliteTable('social_reference_metrics', {
  id: text('id').primaryKey(),
  referenceId: text('reference_id').notNull(),
  capturedAt: integer('captured_at').notNull(),
  likes: integer('likes'),
  comments: integer('comments'),
  shares: integer('shares'),
  impressions: integer('impressions'),
  saves: integer('saves'),
  metricsJson: text('metrics_json'),
  createdAt: integer('created_at').notNull(),
});

export const socialRadarClusterCache = sqliteTable('social_radar_cluster_cache', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().default('default'),
  feed: text('feed').notNull(),
  topicKey: text('topic_key').notNull(),
  payloadJson: text('payload_json').notNull(),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const socialInterestProfile = sqliteTable('social_interest_profile', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().default('default'),
  topicKey: text('topic_key').notNull(),
  weight: integer('weight').notNull().default(0),
  evidenceJson: text('evidence_json'),
  updatedAt: integer('updated_at').notNull(),
});

export const socialTrendEvents = sqliteTable('social_trend_events', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().default('default'),
  clusterId: text('cluster_id'),
  eventType: text('event_type').notNull(),
  payloadJson: text('payload_json'),
  createdAt: integer('created_at').notNull(),
});

export const socialTrendAttributions = sqliteTable('social_trend_attributions', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().default('default'),
  clusterId: text('cluster_id').notNull(),
  draftId: text('draft_id'),
  postId: text('post_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
