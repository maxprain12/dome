/**
 * 0001_core — settings, dome_cloud_sync, dome_provider_sessions, auth_profiles
 */
module.exports = {
  id: '0001_core',
  up: async (db) => {
    await db.exec(`
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE TABLE dome_cloud_sync (
        id BIGINT PRIMARY KEY CHECK (id = 1),
        device_id TEXT NOT NULL,
        last_server_revision BIGINT NOT NULL DEFAULT 0,
        last_event_poll_at BIGINT NOT NULL DEFAULT 0,
        updated_at BIGINT NOT NULL,
        last_push_at BIGINT NOT NULL DEFAULT 0
      );

      CREATE TABLE dome_provider_sessions (
        user_id TEXT PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expires_at BIGINT NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE TABLE auth_profiles (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('api_key', 'oauth', 'token')),
        credentials TEXT NOT NULL,
        is_default BIGINT DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE INDEX idx_auth_profiles_provider ON auth_profiles(provider);
    `);
  },
};
