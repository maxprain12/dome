/**
 * 0011_feeders — feeders, feeder_runs, feeder_secrets
 */
module.exports = {
  id: '0011_feeders',
  up: async (db) => {
    await db.exec(`
      CREATE TABLE feeders (
        id TEXT PRIMARY KEY,
        artifact_resource_id TEXT NOT NULL,
        slot TEXT NOT NULL DEFAULT 'default',
        name TEXT NOT NULL,
        description TEXT,
        interpreter TEXT NOT NULL CHECK(interpreter IN ('python3', 'node', 'bash', 'sh', 'curl')),
        script TEXT NOT NULL,
        script_hash TEXT NOT NULL,
        env_secret_refs TEXT NOT NULL DEFAULT '[]',
        env_static TEXT NOT NULL DEFAULT '{}',
        output_mode TEXT NOT NULL DEFAULT 'stdout_json' CHECK(output_mode IN ('stdout_json', 'output_file')),
        update_policy TEXT NOT NULL DEFAULT 'replace' CHECK(update_policy IN ('replace', 'merge_shallow', 'merge_deep', 'append_array')),
        timeout_ms BIGINT NOT NULL DEFAULT 60000,
        enabled BIGINT NOT NULL DEFAULT 1,
        approved BIGINT NOT NULL DEFAULT 0,
        approved_script_hash TEXT,
        last_run_at BIGINT,
        last_status TEXT,
        last_error TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE INDEX idx_feeders_artifact ON feeders(artifact_resource_id);
      CREATE INDEX idx_feeders_enabled ON feeders(enabled, approved);

      CREATE TABLE feeder_runs (
        id TEXT PRIMARY KEY,
        feeder_id TEXT NOT NULL,
        started_at BIGINT NOT NULL,
        finished_at BIGINT,
        status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed')),
        exit_code BIGINT,
        stdout_excerpt TEXT,
        stderr_excerpt TEXT,
        data_bytes BIGINT NOT NULL DEFAULT 0,
        triggered_by TEXT NOT NULL CHECK(triggered_by IN ('agent', 'user', 'automation')),
        automation_id TEXT
      );

      CREATE INDEX idx_feeder_runs_feeder ON feeder_runs(feeder_id, started_at DESC);

      CREATE TABLE feeder_secrets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        encrypted_value BLOB NOT NULL,
        last_used_at BIGINT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE INDEX idx_feeder_secrets_name ON feeder_secrets(name);
    `);
  },
};
