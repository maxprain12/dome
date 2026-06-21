/**
 * 0014_artifacts — artifacts, artifact_runtime_data
 */
module.exports = {
  id: '0014_artifacts',
  up: async (db) => {
    await db.exec(`
      CREATE TABLE artifacts (
        id TEXT PRIMARY KEY,
        resource_id TEXT NOT NULL UNIQUE,
        artifact_type TEXT NOT NULL CHECK(artifact_type IN ('task-tracker', 'chart', 'custom')),
        template TEXT,
        state TEXT NOT NULL DEFAULT '{}',
        linked_resource_id TEXT,
        version BIGINT NOT NULL DEFAULT 1,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE INDEX idx_artifacts_resource ON artifacts(resource_id);
      CREATE INDEX idx_artifacts_type ON artifacts(artifact_type);

      CREATE TABLE artifact_runtime_data (
        id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL,
        slot TEXT NOT NULL DEFAULT 'default',
        data_json TEXT NOT NULL,
        schema_version BIGINT NOT NULL DEFAULT 1,
        last_run_id TEXT,
        last_automation_id TEXT,
        updated_at BIGINT NOT NULL,
        UNIQUE(artifact_id, slot)
      );

      CREATE INDEX idx_artifact_runtime_data_artifact ON artifact_runtime_data(artifact_id);
      CREATE INDEX idx_artifact_runtime_data_auto ON artifact_runtime_data(last_automation_id);
    `);
  },
};
