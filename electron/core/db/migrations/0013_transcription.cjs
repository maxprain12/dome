/**
 * 0013_transcription — transcription_sessions, transcription_chunks
 */
module.exports = {
  id: '0013_transcription',
  up: async (db) => {
    await db.exec(`
      CREATE TABLE transcription_sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT 'default',
        folder_id TEXT,
        status TEXT NOT NULL CHECK(status IN ('recording','paused','transcribing','done','error','cancelled')),
        sources TEXT NOT NULL,
        live_preview BIGINT NOT NULL DEFAULT 0,
        save_audio BIGINT NOT NULL DEFAULT 1,
        session_dir TEXT NOT NULL,
        resource_id TEXT,
        partial_text TEXT NOT NULL DEFAULT '',
        error_message TEXT,
        started_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        finished_at BIGINT
      );

      CREATE INDEX idx_transcription_sessions_project ON transcription_sessions(project_id);
      CREATE INDEX idx_transcription_sessions_status ON transcription_sessions(status);

      CREATE TABLE transcription_chunks (
        session_id TEXT NOT NULL,
        seq BIGINT NOT NULL,
        track TEXT NOT NULL CHECK(track IN ('mic','system')),
        start_ms BIGINT NOT NULL,
        duration_ms BIGINT,
        file_path TEXT NOT NULL,
        text TEXT,
        PRIMARY KEY (session_id, track, seq)
      );
    `);
  },
};
