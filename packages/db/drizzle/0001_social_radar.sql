CREATE TABLE IF NOT EXISTS social_reference_metrics (
  id TEXT PRIMARY KEY,
  reference_id TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  likes INTEGER,
  comments INTEGER,
  shares INTEGER,
  impressions INTEGER,
  saves INTEGER,
  metrics_json TEXT,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_social_reference_metrics_ref ON social_reference_metrics(reference_id, captured_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS social_radar_cluster_cache (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL DEFAULT 'default',
  feed TEXT NOT NULL,
  topic_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_social_radar_cluster_cache_feed ON social_radar_cluster_cache(project_id, feed, expires_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS social_interest_profile (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL DEFAULT 'default',
  topic_key TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 0,
  evidence_json TEXT,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_interest_profile_topic ON social_interest_profile(project_id, topic_key);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS social_trend_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL DEFAULT 'default',
  cluster_id TEXT,
  event_type TEXT NOT NULL,
  payload_json TEXT,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_social_trend_events_project ON social_trend_events(project_id, created_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS social_trend_attributions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL DEFAULT 'default',
  cluster_id TEXT NOT NULL,
  draft_id TEXT,
  post_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_social_trend_attributions_cluster ON social_trend_attributions(project_id, cluster_id);
