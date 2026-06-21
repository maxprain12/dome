/**
 * 0008_learn — flashcard_decks, flashcards, flashcard_sessions, study_events,
 * quiz_runs, learn_kpis_cache, studio_outputs
 */
module.exports = {
  id: '0008_learn',
  up: async (db) => {
    await db.exec(`
      CREATE TABLE flashcard_decks (
        id TEXT PRIMARY KEY,
        resource_id TEXT,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        card_count BIGINT NOT NULL DEFAULT 0,
        tags TEXT,
        settings TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE INDEX idx_flashcard_decks_project ON flashcard_decks(project_id);
      CREATE INDEX idx_flashcard_decks_resource ON flashcard_decks(resource_id);

      CREATE TABLE flashcards (
        id TEXT PRIMARY KEY,
        deck_id TEXT NOT NULL,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        difficulty TEXT DEFAULT 'medium',
        tags TEXT,
        metadata TEXT,
        ease_factor DOUBLE DEFAULT 2.5,
        interval BIGINT DEFAULT 0,
        repetitions BIGINT DEFAULT 0,
        next_review_at BIGINT,
        last_reviewed_at BIGINT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        stability DOUBLE,
        fsrs_difficulty DOUBLE,
        fsrs_state BIGINT DEFAULT 0,
        lapses BIGINT DEFAULT 0,
        scheduled_days BIGINT DEFAULT 0,
        learning_steps BIGINT DEFAULT 0,
        last_rating BIGINT
      );

      CREATE INDEX idx_flashcards_deck ON flashcards(deck_id);
      CREATE INDEX idx_flashcards_next_review ON flashcards(next_review_at);

      CREATE TABLE flashcard_sessions (
        id TEXT PRIMARY KEY,
        deck_id TEXT NOT NULL,
        cards_studied BIGINT DEFAULT 0,
        cards_correct BIGINT DEFAULT 0,
        cards_incorrect BIGINT DEFAULT 0,
        duration_ms BIGINT DEFAULT 0,
        started_at BIGINT NOT NULL,
        completed_at BIGINT
      );

      CREATE INDEX idx_flashcard_sessions_deck ON flashcard_sessions(deck_id);

      CREATE TABLE study_events (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        deck_id TEXT,
        studio_output_id TEXT,
        kind TEXT NOT NULL,
        cards_studied BIGINT DEFAULT 0,
        cards_correct BIGINT DEFAULT 0,
        cards_incorrect BIGINT DEFAULT 0,
        duration_ms BIGINT DEFAULT 0,
        started_at BIGINT NOT NULL,
        completed_at BIGINT
      );

      CREATE INDEX idx_study_events_deck ON study_events(deck_id);
      CREATE INDEX idx_study_events_kind ON study_events(kind);
      CREATE INDEX idx_study_events_project ON study_events(project_id);
      CREATE INDEX idx_study_events_started ON study_events(started_at);

      CREATE TABLE quiz_runs (
        id TEXT PRIMARY KEY,
        studio_output_id TEXT NOT NULL,
        deck_id TEXT,
        total BIGINT NOT NULL,
        correct BIGINT NOT NULL,
        duration_ms BIGINT NOT NULL,
        per_question TEXT NOT NULL,
        started_at BIGINT NOT NULL,
        completed_at BIGINT NOT NULL
      );

      CREATE INDEX idx_quiz_runs_completed ON quiz_runs(completed_at DESC);
      CREATE INDEX idx_quiz_runs_output ON quiz_runs(studio_output_id);

      CREATE TABLE learn_kpis_cache (
        scope TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        computed_at BIGINT NOT NULL
      );

      CREATE TABLE studio_outputs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        source_ids TEXT,
        file_path TEXT,
        metadata TEXT,
        deck_id TEXT,
        resource_id TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE INDEX idx_studio_outputs_deck ON studio_outputs(deck_id);
      CREATE INDEX idx_studio_outputs_project ON studio_outputs(project_id);
      CREATE INDEX idx_studio_outputs_resource ON studio_outputs(resource_id);
      CREATE INDEX idx_studio_outputs_type ON studio_outputs(type);
    `);
  },
};
