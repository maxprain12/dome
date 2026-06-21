[DB] Running migration 1: Add internal file storage columns
[DB] Migration 1 complete
[DB] Folder type constraint missing, migration needed
[DB] Running migration 2: Update resources type constraint to include folder
[DB] Existing columns: id, project_id, type, title, content, file_path, metadata, created_at, updated_at, internal_path, file_mime_type, file_size, file_hash, thumbnail_data, original_filename
[DB] Copying columns: id, project_id, type, title, content, file_path, metadata, created_at, updated_at, internal_path, file_mime_type, file_size, file_hash, thumbnail_data, original_filename
[DB] Migration 2 complete - folder type constraint added
[DB] folder_id column already exists, skipping migration 3
[DB] Running migration 4: Add auth_profiles and martin_memory tables
[DB] Migration 4 complete - auth_profiles and martin_memory tables added
[DB] Running migration 5: Add knowledge graph tables
[DB] Syncing existing resources to graph_nodes...
[DB] Migration 5 complete - knowledge graph tables added
[DB] Running migration 6: Add flashcard tables
[DB] Migration 6 complete - flashcard tables added
[DB] Running migration 7: Add studio_outputs table
[DB] Migration 7 complete - studio_outputs table added
[DB] Running migration 8: Studio-Flashcards unification
[DB] Migration 8 complete - studio-flashcards unification
[DB] Notebook type constraint missing, migration needed
[DB] Running migration 9: Add notebook type to resources
[DB] Migration 9 complete - notebook type added
[DB] Excel type constraint missing, migration needed
[DB] Running migration 10: Add excel type to resources
[DB] Migration 10 complete - excel type added
[DB] PPT type constraint missing, migration needed
[DB] Running migration 11: Add ppt type to resources
[DB] Migration 11 complete - ppt type added
[DB] Running migration 12: Add calendar tables
[DB] Migration 12 complete - calendar tables added
[DB] Running migration 14: Schema cleanup
[DB] Migration 14 complete - schema cleanup done
[DB] Running migration 15 - chat sessions and traces
[DB] Migration 15 complete - chat sessions and traces
[DB] Running migration 16 - enrich chat sessions metadata
[DB] Running migration 17 - automation definitions and persistent runs
[DB] Migration 17 complete - automation definitions and persistent runs
[DB] Migration 18 complete - resource images for Docling
[DB] Migration 19 complete - dedicated runtime entity tables
[DB] Migration 20 complete - agent/workflow folders + favorites
[DB] Migration 21 complete - many_agents.favorite repair
[DB] Migration 22 complete - agent/workflow folder columns repair
[DB] Migration 23 complete - project scope for agents, workflows, chat, automations, runs
[DB] Migration 24 complete - semantic_relations, note_embeddings
[DB] Migration 25 complete - resource_chunks, removed note_embeddings, cleared auto relations
[DB] Migration 26 complete - pageindex/docling removed, transcripts, page_number on chunks
[DB] Running migration 27 - transcription sessions & chunks
[DB] Migration 27 complete - transcription sessions & chunks
[DB] Running migration 28: add artifact type to resources
[DB] Migration 28 complete - artifact type added to resources
[DB] Running migration 29 - artifact_runtime_data + automation_artifact_bindings
[DB] Migration 29 complete - artifact runtime + automation bindings
[DB] Running migration 30 - reclassify xlsx/pptx resources
[DB] Migration 30 complete - xlsx/pptx reclassified
[DB] Running migration 31 - drop WhatsApp tables
[DB] Migration 31 complete
[DB] Running migration 32 - dome_cloud_sync
[DB] Migration 32 complete
[DB] Running migration 33 - dome_cloud_sync last_push_at
[DB] Migration 33 complete
[DB] Running migration 34 - agent_store table
[DB] Migration 34 complete
[DB] Running migration 35 - many_agent_versions table
[DB] Migration 35 complete
[DB] Running migration 36 - artifact feeders
[DB] Migration 36 complete - artifact feeders
[DB] Running migration 37 - quiz_runs
[DB] Migration 37 complete - quiz_runs
[DB] Running migration 38 - FSRS flashcard fields
[DB] Migration 38 complete - FSRS fields
[DB] Running migration 39 - card_count triggers
[DB] Migration 39 complete - card_count triggers
[DB] Running migration 40 - study_events + FKs
[DB] Migration 40 complete - study_events + FKs
[DB] Running migration 41 - learn_kpis_cache
[DB] Migration 41 complete - learn_kpis_cache
[DB] Running migration 42 - per-provider AI credentials
[DB] Migration 42 complete - per-provider AI credentials
[DB] Running migration 43 - GitHub project sync tables
[DB] Migration 43 complete - GitHub project sync tables
[DB] Running migration 44 - GitHub milestone closed_at
[DB] Migration 44 complete - GitHub milestone closed_at
[DB] Running migration 45 - email accounts (himalaya)
[DB] Migration 45 complete - email accounts
[DB] Running migration 46 - notes markdown vault (vault_path)
[DB] Migration 46 complete - vault_path column added
[DB] Running migration 47 - notes vault source-of-truth (content_text/hash + FTS)
[DB] Migration 47 - backfilled content_text for 0 notes
[DB] Migration 47 complete - content_text/hash + FTS repointed
[DB] Running migration 48 - per-project vault root + project-relative vault_path
[DB] Migration 48 complete - vault_root + project-relative vault_path
[DB] Running migration 49 - move binaries into the vault
[DB] Migration 49 complete - binaries in vault
[DB] Running migration 51 - github_releases.body
[DB] Migration 51 complete - github_releases.body added
[DB] Running migration 50 - snap GitHub all-day events to midnight
[DB] Migration 50 - snapped 0 GitHub all-day events to midnight
[DB] Migration 50 complete - GitHub all-day events snapped

-- [table] agent_folders
CREATE TABLE agent_folders (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL DEFAULT 'default' REFERENCES projects(id) ON DELETE CASCADE,
      parent_id TEXT,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

-- [table] agent_store
CREATE TABLE agent_store (
          namespace TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (namespace, key)
        );

-- [table] ai_skills
CREATE TABLE ai_skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      prompt TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

-- [table] artifact_runtime_data
CREATE TABLE artifact_runtime_data (
          id TEXT PRIMARY KEY,
          artifact_id TEXT NOT NULL,
          slot TEXT NOT NULL DEFAULT 'default',
          data_json TEXT NOT NULL,
          schema_version INTEGER NOT NULL DEFAULT 1,
          last_run_id TEXT,
          last_automation_id TEXT,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE,
          UNIQUE(artifact_id, slot)
        );

-- [table] artifacts
CREATE TABLE artifacts (
      id TEXT PRIMARY KEY,
      resource_id TEXT NOT NULL UNIQUE,
      artifact_type TEXT NOT NULL CHECK(artifact_type IN ('task-tracker', 'chart', 'custom')),
      template TEXT,
      state TEXT NOT NULL DEFAULT '{}',
      linked_resource_id TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
      FOREIGN KEY (linked_resource_id) REFERENCES resources(id) ON DELETE SET NULL
    );

-- [table] auth_profiles
CREATE TABLE auth_profiles (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('api_key', 'oauth', 'token')),
          credentials TEXT NOT NULL,
          is_default INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

-- [table] automation_artifact_bindings
CREATE TABLE automation_artifact_bindings (
          id TEXT PRIMARY KEY,
          automation_id TEXT NOT NULL,
          artifact_resource_id TEXT NOT NULL,
          slot TEXT NOT NULL DEFAULT 'default',
          update_policy TEXT NOT NULL DEFAULT 'replace',
          transform_hint TEXT,
          extract_mode TEXT NOT NULL DEFAULT 'json_fence',
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (automation_id) REFERENCES automation_definitions(id) ON DELETE CASCADE,
          FOREIGN KEY (artifact_resource_id) REFERENCES resources(id) ON DELETE CASCADE
        );

-- [table] automation_definitions
CREATE TABLE "automation_definitions" (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          title TEXT NOT NULL,
          description TEXT,
          target_type TEXT NOT NULL CHECK(target_type IN ('many', 'agent', 'workflow', 'feeder')),
          target_id TEXT NOT NULL,
          trigger_type TEXT NOT NULL CHECK(trigger_type IN ('manual', 'schedule', 'contextual')),
          schedule_json TEXT,
          input_template_json TEXT,
          output_mode TEXT NOT NULL DEFAULT 'chat_only',
          enabled INTEGER NOT NULL DEFAULT 0,
          legacy_source TEXT,
          last_run_at INTEGER,
          last_run_status TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

-- [table] automation_run_links
CREATE TABLE automation_run_links (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          link_type TEXT NOT NULL,
          link_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (run_id) REFERENCES automation_runs(id) ON DELETE CASCADE
        );

-- [table] automation_run_steps
CREATE TABLE automation_run_steps (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          parent_step_id TEXT,
          step_type TEXT NOT NULL,
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'done',
          content TEXT,
          metadata TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (run_id) REFERENCES automation_runs(id) ON DELETE CASCADE,
          FOREIGN KEY (parent_step_id) REFERENCES automation_run_steps(id) ON DELETE SET NULL
        );

-- [table] automation_runs
CREATE TABLE automation_runs (
          id TEXT PRIMARY KEY,
          automation_id TEXT,
          owner_type TEXT NOT NULL CHECK(owner_type IN ('many', 'agent', 'workflow', 'automation')),
          owner_id TEXT NOT NULL,
          title TEXT,
          status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled')),
          session_id TEXT,
          workflow_id TEXT,
          workflow_execution_id TEXT,
          thread_id TEXT,
          output_text TEXT,
          summary TEXT,
          error TEXT,
          metadata TEXT,
          started_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          finished_at INTEGER,
          last_heartbeat_at INTEGER, project_id TEXT NOT NULL DEFAULT 'default',
          FOREIGN KEY (automation_id) REFERENCES automation_definitions(id) ON DELETE SET NULL,
          FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE SET NULL
        );

-- [table] calendar_accounts
CREATE TABLE calendar_accounts (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL CHECK(provider IN ('google', 'local')),
          account_email TEXT NOT NULL,
          credentials TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disconnected', 'error')),
          last_sync_at INTEGER,
          sync_token TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

-- [table] calendar_calendars
CREATE TABLE calendar_calendars (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          remote_id TEXT NOT NULL,
          title TEXT NOT NULL,
          color TEXT,
          is_selected INTEGER DEFAULT 1,
          is_default INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (account_id) REFERENCES calendar_accounts(id) ON DELETE CASCADE,
          UNIQUE(account_id, remote_id)
        );

-- [table] calendar_event_links
CREATE TABLE calendar_event_links (
          id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          remote_event_id TEXT NOT NULL,
          remote_calendar_id TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE CASCADE,
          UNIQUE(provider, remote_event_id)
        );

-- [table] calendar_events
CREATE TABLE calendar_events (
          id TEXT PRIMARY KEY,
          calendar_id TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          location TEXT,
          start_at INTEGER NOT NULL,
          end_at INTEGER NOT NULL,
          timezone TEXT,
          all_day INTEGER DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed', 'tentative', 'cancelled')),
          reminders TEXT,
          metadata TEXT,
          source TEXT DEFAULT 'local' CHECK(source IN ('local', 'google', 'manual')),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (calendar_id) REFERENCES calendar_calendars(id) ON DELETE CASCADE
        );

-- [table] calendar_notifications
CREATE TABLE calendar_notifications (
          id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL,
          notify_at INTEGER NOT NULL,
          notified_at INTEGER,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE CASCADE,
          UNIQUE(event_id, notify_at)
        );

-- [table] canvas_workflows
CREATE TABLE canvas_workflows (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL DEFAULT 'default' REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      nodes_json TEXT NOT NULL DEFAULT '[]',
      edges_json TEXT NOT NULL DEFAULT '[]',
      marketplace_json TEXT,
      folder_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (folder_id) REFERENCES workflow_folders(id) ON DELETE SET NULL
    );

-- [table] chat_messages
CREATE TABLE chat_messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          tool_calls TEXT,
          thinking TEXT,
          metadata TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
        );

-- [table] chat_sessions
CREATE TABLE chat_sessions (
          id TEXT PRIMARY KEY,
          agent_id TEXT,
          resource_id TEXT,
          mode TEXT,
          context_id TEXT,
          thread_id TEXT,
          title TEXT,
          tool_ids TEXT,
          mcp_server_ids TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        , project_id TEXT NOT NULL DEFAULT 'default');

-- [table] chat_traces
CREATE TABLE chat_traces (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          message_id TEXT,
          type TEXT NOT NULL CHECK(type IN ('tool_call', 'tool_result', 'decision', 'interrupt')),
          tool_name TEXT,
          tool_args TEXT,
          result TEXT,
          mcp_server_id TEXT,
          decision TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
          FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE SET NULL
        );

-- [table] dome_cloud_sync
CREATE TABLE dome_cloud_sync (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          device_id TEXT NOT NULL,
          last_server_revision INTEGER NOT NULL DEFAULT 0,
          last_event_poll_at INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL
        , last_push_at INTEGER NOT NULL DEFAULT 0);

-- [table] dome_provider_sessions
CREATE TABLE dome_provider_sessions (
      user_id TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

-- [table] email_accounts
CREATE TABLE email_accounts (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          display_name TEXT,
          imap_host TEXT NOT NULL,
          imap_port INTEGER NOT NULL DEFAULT 993,
          imap_encryption TEXT NOT NULL DEFAULT 'tls',
          smtp_host TEXT NOT NULL,
          smtp_port INTEGER NOT NULL DEFAULT 465,
          smtp_encryption TEXT NOT NULL DEFAULT 'tls',
          username TEXT NOT NULL,
          secret TEXT NOT NULL,
          is_default INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'active',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

-- [table] feeder_runs
CREATE TABLE feeder_runs (
          id TEXT PRIMARY KEY,
          feeder_id TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          finished_at INTEGER,
          status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed')),
          exit_code INTEGER,
          stdout_excerpt TEXT,
          stderr_excerpt TEXT,
          data_bytes INTEGER NOT NULL DEFAULT 0,
          triggered_by TEXT NOT NULL CHECK(triggered_by IN ('agent', 'user', 'automation')),
          automation_id TEXT,
          FOREIGN KEY (feeder_id) REFERENCES feeders(id) ON DELETE CASCADE,
          FOREIGN KEY (automation_id) REFERENCES automation_definitions(id) ON DELETE SET NULL
        );

-- [table] feeder_secrets
CREATE TABLE feeder_secrets (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          encrypted_value BLOB NOT NULL,
          last_used_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

-- [table] feeders
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
          timeout_ms INTEGER NOT NULL DEFAULT 60000,
          enabled INTEGER NOT NULL DEFAULT 1,
          approved INTEGER NOT NULL DEFAULT 0,
          approved_script_hash TEXT,
          last_run_at INTEGER,
          last_status TEXT,
          last_error TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (artifact_resource_id) REFERENCES resources(id) ON DELETE CASCADE
        );

-- [table] flashcard_decks
CREATE TABLE "flashcard_decks" (
          id TEXT PRIMARY KEY,
          resource_id TEXT REFERENCES resources(id) ON DELETE CASCADE,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          description TEXT,
          card_count INTEGER NOT NULL DEFAULT 0,
          tags TEXT,
          settings TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

-- [table] flashcard_sessions
CREATE TABLE flashcard_sessions (
          id TEXT PRIMARY KEY,
          deck_id TEXT NOT NULL,
          cards_studied INTEGER DEFAULT 0,
          cards_correct INTEGER DEFAULT 0,
          cards_incorrect INTEGER DEFAULT 0,
          duration_ms INTEGER DEFAULT 0,
          started_at INTEGER NOT NULL,
          completed_at INTEGER,
          FOREIGN KEY (deck_id) REFERENCES flashcard_decks(id) ON DELETE CASCADE
        );

-- [table] flashcards
CREATE TABLE flashcards (
          id TEXT PRIMARY KEY,
          deck_id TEXT NOT NULL,
          question TEXT NOT NULL,
          answer TEXT NOT NULL,
          difficulty TEXT DEFAULT 'medium',
          tags TEXT,
          metadata TEXT,
          ease_factor REAL DEFAULT 2.5,
          interval INTEGER DEFAULT 0,
          repetitions INTEGER DEFAULT 0,
          next_review_at INTEGER,
          last_reviewed_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL, stability REAL, fsrs_difficulty REAL, fsrs_state INTEGER DEFAULT 0, lapses INTEGER DEFAULT 0, scheduled_days INTEGER DEFAULT 0, learning_steps INTEGER DEFAULT 0, last_rating INTEGER,
          FOREIGN KEY (deck_id) REFERENCES flashcard_decks(id) ON DELETE CASCADE
        );

-- [table] github_branches
CREATE TABLE github_branches (
          id TEXT PRIMARY KEY,
          repo_id TEXT NOT NULL,
          name TEXT NOT NULL,
          sha TEXT,
          protected INTEGER DEFAULT 0,
          linked_issue_number INTEGER,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (repo_id) REFERENCES github_repos(id) ON DELETE CASCADE,
          UNIQUE(repo_id, name)
        );

-- [table] github_calendar_links
CREATE TABLE github_calendar_links (
          id TEXT PRIMARY KEY,
          entity_type TEXT NOT NULL CHECK(entity_type IN ('milestone', 'issue', 'release')),
          entity_id TEXT NOT NULL,
          event_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE CASCADE,
          UNIQUE(entity_type, entity_id)
        );

-- [table] github_issues
CREATE TABLE github_issues (
          id TEXT PRIMARY KEY,
          repo_id TEXT NOT NULL,
          number INTEGER NOT NULL,
          title TEXT NOT NULL,
          body TEXT,
          state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open', 'closed')),
          milestone_number INTEGER,
          due_date INTEGER,
          labels TEXT,
          assignees TEXT,
          is_pull_request INTEGER DEFAULT 0,
          html_url TEXT,
          remote_updated_at INTEGER,
          dome_updated_at INTEGER,
          dirty INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (repo_id) REFERENCES github_repos(id) ON DELETE CASCADE,
          UNIQUE(repo_id, number)
        );

-- [table] github_milestones
CREATE TABLE github_milestones (
          id TEXT PRIMARY KEY,
          repo_id TEXT NOT NULL,
          number INTEGER NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          due_on INTEGER,
          state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open', 'closed')),
          open_issues INTEGER DEFAULT 0,
          closed_issues INTEGER DEFAULT 0,
          html_url TEXT,
          remote_updated_at INTEGER,
          dome_updated_at INTEGER,
          dirty INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL, closed_at INTEGER,
          FOREIGN KEY (repo_id) REFERENCES github_repos(id) ON DELETE CASCADE,
          UNIQUE(repo_id, number)
        );

-- [table] github_releases
CREATE TABLE github_releases (
          id TEXT PRIMARY KEY,
          repo_id TEXT NOT NULL,
          remote_id INTEGER NOT NULL,
          tag_name TEXT NOT NULL,
          name TEXT,
          published_at INTEGER,
          html_url TEXT,
          updated_at INTEGER NOT NULL, body TEXT,
          FOREIGN KEY (repo_id) REFERENCES github_repos(id) ON DELETE CASCADE,
          UNIQUE(repo_id, remote_id)
        );

-- [table] github_repos
CREATE TABLE github_repos (
          id TEXT PRIMARY KEY,
          remote_id INTEGER NOT NULL,
          owner TEXT NOT NULL,
          name TEXT NOT NULL,
          full_name TEXT NOT NULL,
          private INTEGER DEFAULT 0,
          html_url TEXT,
          selected INTEGER DEFAULT 0,
          last_sync_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE(full_name)
        );

-- [table] github_sync_state
CREATE TABLE github_sync_state (
          id TEXT PRIMARY KEY,
          repo_id TEXT NOT NULL,
          resource TEXT NOT NULL,
          etag TEXT,
          last_synced_at INTEGER,
          FOREIGN KEY (repo_id) REFERENCES github_repos(id) ON DELETE CASCADE,
          UNIQUE(repo_id, resource)
        );

-- [table] graph_edges
CREATE TABLE graph_edges (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL,
          target_id TEXT NOT NULL,
          relation TEXT NOT NULL,
          weight REAL DEFAULT 1.0,
          metadata TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (source_id) REFERENCES graph_nodes(id) ON DELETE CASCADE,
          FOREIGN KEY (target_id) REFERENCES graph_nodes(id) ON DELETE CASCADE
        );

-- [table] graph_nodes
CREATE TABLE graph_nodes (
          id TEXT PRIMARY KEY,
          resource_id TEXT,
          label TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('resource', 'concept', 'person', 'location', 'event', 'topic')),
          properties TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
        );

-- [table] interactions_fts
CREATE VIRTUAL TABLE interactions_fts USING fts5(
      interaction_id,
      content
    );

-- [table] interactions_fts_config
CREATE TABLE 'interactions_fts_config'(k PRIMARY KEY, v) WITHOUT ROWID;

-- [table] interactions_fts_content
CREATE TABLE 'interactions_fts_content'(id INTEGER PRIMARY KEY, c0, c1);

-- [table] interactions_fts_data
CREATE TABLE 'interactions_fts_data'(id INTEGER PRIMARY KEY, block BLOB);

-- [table] interactions_fts_docsize
CREATE TABLE 'interactions_fts_docsize'(id INTEGER PRIMARY KEY, sz BLOB);

-- [table] interactions_fts_idx
CREATE TABLE 'interactions_fts_idx'(segid, term, pgno, PRIMARY KEY(segid, term)) WITHOUT ROWID;

-- [table] learn_kpis_cache
CREATE TABLE learn_kpis_cache (
          scope TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          computed_at INTEGER NOT NULL
        );

-- [table] many_agent_versions
CREATE TABLE many_agent_versions (
          id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL REFERENCES many_agents(id) ON DELETE CASCADE,
          version_number INTEGER NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          system_instructions TEXT,
          tool_ids TEXT NOT NULL DEFAULT '[]',
          mcp_server_ids TEXT NOT NULL DEFAULT '[]',
          skill_ids TEXT NOT NULL DEFAULT '[]',
          icon_index INTEGER NOT NULL DEFAULT 1,
          change_note TEXT,
          created_at INTEGER NOT NULL
        );

-- [table] many_agents
CREATE TABLE many_agents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL DEFAULT 'default' REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      system_instructions TEXT,
      tool_ids TEXT NOT NULL DEFAULT '[]',
      mcp_server_ids TEXT NOT NULL DEFAULT '[]',
      skill_ids TEXT NOT NULL DEFAULT '[]',
      icon_index INTEGER NOT NULL DEFAULT 1,
      marketplace_id TEXT,
      folder_id TEXT,
      favorite INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (folder_id) REFERENCES agent_folders(id) ON DELETE SET NULL
    );

-- [table] marketplace_agent_installs
CREATE TABLE marketplace_agent_installs (
      marketplace_id TEXT PRIMARY KEY,
      local_agent_id TEXT NOT NULL,
      version TEXT,
      author TEXT,
      source TEXT,
      installed_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      capabilities_json TEXT NOT NULL DEFAULT '[]',
      resource_affinity_json TEXT NOT NULL DEFAULT '[]'
    );

-- [table] marketplace_template_mappings
CREATE TABLE marketplace_template_mappings (
      template_id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

-- [table] marketplace_workflow_installs
CREATE TABLE marketplace_workflow_installs (
      template_id TEXT PRIMARY KEY,
      local_workflow_id TEXT NOT NULL,
      version TEXT,
      author TEXT,
      source TEXT,
      installed_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      capabilities_json TEXT NOT NULL DEFAULT '[]',
      resource_affinity_json TEXT NOT NULL DEFAULT '[]'
    );

-- [table] mcp_global_settings
CREATE TABLE mcp_global_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    );

-- [table] mcp_servers
CREATE TABLE mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK(type IN ('stdio', 'http', 'sse')),
      command TEXT,
      args_json TEXT,
      url TEXT,
      headers_json TEXT,
      env_json TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      tools_json TEXT,
      enabled_tool_ids_json TEXT,
      last_discovery_at INTEGER,
      last_discovery_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

-- [table] projects
CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      parent_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL, vault_root TEXT,
      FOREIGN KEY (parent_id) REFERENCES projects(id) ON DELETE CASCADE
    );

-- [table] quiz_runs
CREATE TABLE "quiz_runs" (
            id TEXT PRIMARY KEY,
            studio_output_id TEXT NOT NULL,
            deck_id TEXT,
            total INTEGER NOT NULL,
            correct INTEGER NOT NULL,
            duration_ms INTEGER NOT NULL,
            per_question TEXT NOT NULL,
            started_at INTEGER NOT NULL,
            completed_at INTEGER NOT NULL,
            FOREIGN KEY (studio_output_id) REFERENCES studio_outputs(id) ON DELETE CASCADE,
            FOREIGN KEY (deck_id) REFERENCES flashcard_decks(id) ON DELETE SET NULL
          );

-- [table] resource_chunks
CREATE TABLE resource_chunks (
      id TEXT PRIMARY KEY,
      resource_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      text TEXT NOT NULL,
      embedding BLOB NOT NULL,
      model_version TEXT NOT NULL,
      char_start INTEGER,
      char_end INTEGER,
      page_number INTEGER,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
      UNIQUE(resource_id, chunk_index)
    );

-- [table] resource_interactions
CREATE TABLE resource_interactions (
      id TEXT PRIMARY KEY,
      resource_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('note', 'annotation', 'chat')),
      content TEXT NOT NULL,
      position_data TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
    );

-- [table] resource_tags
CREATE TABLE resource_tags (
      resource_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (resource_id, tag_id),
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

-- [table] resource_transcripts
CREATE TABLE resource_transcripts (
          resource_id TEXT NOT NULL,
          page_number INTEGER NOT NULL,
          markdown TEXT NOT NULL,
          model_used TEXT,
          file_hash TEXT,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (resource_id, page_number),
          FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
        );

-- [table] resources
CREATE TABLE "resources" (
              id TEXT PRIMARY KEY,
              project_id TEXT NOT NULL,
              type TEXT NOT NULL CHECK(type IN (
                'note','pdf','video','audio','image','url','document',
                'folder','notebook','excel','ppt','artifact'
              )),
              title TEXT NOT NULL,
              content TEXT,
              file_path TEXT,
              internal_path TEXT,
              file_mime_type TEXT,
              file_size INTEGER,
              file_hash TEXT,
              thumbnail_data TEXT,
              original_filename TEXT,
              folder_id TEXT,
              metadata TEXT,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL, vault_path TEXT, content_text TEXT, content_hash TEXT,
              FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
              FOREIGN KEY (folder_id) REFERENCES "resources"(id) ON DELETE SET NULL
            );

-- [table] resources_fts
CREATE VIRTUAL TABLE resources_fts USING fts5(
      resource_id,
      title,
      content
    );

-- [table] resources_fts_config
CREATE TABLE 'resources_fts_config'(k PRIMARY KEY, v) WITHOUT ROWID;

-- [table] resources_fts_content
CREATE TABLE 'resources_fts_content'(id INTEGER PRIMARY KEY, c0, c1, c2);

-- [table] resources_fts_data
CREATE TABLE 'resources_fts_data'(id INTEGER PRIMARY KEY, block BLOB);

-- [table] resources_fts_docsize
CREATE TABLE 'resources_fts_docsize'(id INTEGER PRIMARY KEY, sz BLOB);

-- [table] resources_fts_idx
CREATE TABLE 'resources_fts_idx'(segid, term, pgno, PRIMARY KEY(segid, term)) WITHOUT ROWID;

-- [table] search_index
CREATE TABLE search_index (
      id TEXT PRIMARY KEY,
      resource_id TEXT UNIQUE NOT NULL,
      combined_text TEXT,
      keywords TEXT,
      last_indexed INTEGER NOT NULL,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
    );

-- [table] semantic_relations
CREATE TABLE semantic_relations (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      similarity REAL NOT NULL,
      relation_type TEXT NOT NULL CHECK(relation_type IN ('auto', 'manual', 'confirmed', 'rejected')),
      label TEXT,
      detected_at INTEGER NOT NULL,
      confirmed_at INTEGER,
      FOREIGN KEY (source_id) REFERENCES resources(id) ON DELETE CASCADE,
      FOREIGN KEY (target_id) REFERENCES resources(id) ON DELETE CASCADE,
      UNIQUE(source_id, target_id)
    );

-- [table] settings
CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

-- [table] sources
CREATE TABLE "sources" (
          id TEXT PRIMARY KEY,
          resource_id TEXT REFERENCES resources(id) ON DELETE CASCADE,
          type TEXT NOT NULL DEFAULT 'article',
          title TEXT NOT NULL,
          authors TEXT,
          year INTEGER,
          doi TEXT,
          url TEXT,
          publisher TEXT,
          journal TEXT,
          volume TEXT,
          issue TEXT,
          pages TEXT,
          isbn TEXT,
          metadata TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

-- [table] studio_outputs
CREATE TABLE "studio_outputs" (
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
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (deck_id) REFERENCES flashcard_decks(id) ON DELETE SET NULL,
            FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE SET NULL
          );

-- [table] study_events
CREATE TABLE study_events (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          deck_id TEXT,
          studio_output_id TEXT,
          kind TEXT NOT NULL,
          cards_studied INTEGER DEFAULT 0,
          cards_correct INTEGER DEFAULT 0,
          cards_incorrect INTEGER DEFAULT 0,
          duration_ms INTEGER DEFAULT 0,
          started_at INTEGER NOT NULL,
          completed_at INTEGER
        );

-- [table] tags
CREATE TABLE tags (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      color TEXT,
      created_at INTEGER NOT NULL
    );

-- [table] transcription_chunks
CREATE TABLE transcription_chunks (
          session_id TEXT NOT NULL,
          seq INTEGER NOT NULL,
          track TEXT NOT NULL CHECK(track IN ('mic','system')),
          start_ms INTEGER NOT NULL,
          duration_ms INTEGER,
          file_path TEXT NOT NULL,
          text TEXT,
          PRIMARY KEY (session_id, track, seq),
          FOREIGN KEY (session_id) REFERENCES transcription_sessions(id) ON DELETE CASCADE
        );

-- [table] transcription_sessions
CREATE TABLE transcription_sessions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL DEFAULT 'default',
          folder_id TEXT,
          status TEXT NOT NULL CHECK(status IN ('recording','paused','transcribing','done','error','cancelled')),
          sources TEXT NOT NULL,
          live_preview INTEGER NOT NULL DEFAULT 0,
          save_audio INTEGER NOT NULL DEFAULT 1,
          session_dir TEXT NOT NULL,
          resource_id TEXT,
          partial_text TEXT NOT NULL DEFAULT '',
          error_message TEXT,
          started_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          finished_at INTEGER,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE SET NULL
        );

-- [table] workflow_executions
CREATE TABLE workflow_executions (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      project_id TEXT NOT NULL DEFAULT 'default' REFERENCES projects(id) ON DELETE CASCADE,
      workflow_name TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      status TEXT NOT NULL,
      entries_json TEXT NOT NULL DEFAULT '[]',
      node_outputs_json TEXT,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (workflow_id) REFERENCES canvas_workflows(id) ON DELETE CASCADE
    );

-- [table] workflow_folders
CREATE TABLE workflow_folders (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL DEFAULT 'default' REFERENCES projects(id) ON DELETE CASCADE,
      parent_id TEXT,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

-- [index] idx_agent_folders_parent
CREATE INDEX idx_agent_folders_parent ON agent_folders(parent_id);

-- [index] idx_agent_folders_project_id
CREATE INDEX idx_agent_folders_project_id ON agent_folders(project_id);

-- [index] idx_agent_store_namespace
CREATE INDEX idx_agent_store_namespace ON agent_store (namespace);

-- [index] idx_ai_skills_enabled
CREATE INDEX idx_ai_skills_enabled ON ai_skills(enabled);

-- [index] idx_artifact_runtime_data_artifact
CREATE INDEX idx_artifact_runtime_data_artifact ON artifact_runtime_data(artifact_id);

-- [index] idx_artifact_runtime_data_auto
CREATE INDEX idx_artifact_runtime_data_auto ON artifact_runtime_data(last_automation_id);

-- [index] idx_artifacts_resource
CREATE INDEX idx_artifacts_resource ON artifacts(resource_id);

-- [index] idx_artifacts_type
CREATE INDEX idx_artifacts_type ON artifacts(artifact_type);

-- [index] idx_auth_profiles_provider
CREATE INDEX idx_auth_profiles_provider ON auth_profiles(provider);

-- [index] idx_auto_art_bindings_auto
CREATE INDEX idx_auto_art_bindings_auto ON automation_artifact_bindings(automation_id);

-- [index] idx_auto_art_bindings_res
CREATE INDEX idx_auto_art_bindings_res ON automation_artifact_bindings(artifact_resource_id);

-- [index] idx_automation_definitions_project
CREATE INDEX idx_automation_definitions_project ON automation_definitions(project_id);

-- [index] idx_automation_definitions_target
CREATE INDEX idx_automation_definitions_target ON automation_definitions(target_type, target_id);

-- [index] idx_automation_definitions_trigger
CREATE INDEX idx_automation_definitions_trigger ON automation_definitions(trigger_type, enabled);

-- [index] idx_automation_run_links_run
CREATE INDEX idx_automation_run_links_run ON automation_run_links(run_id);

-- [index] idx_automation_run_steps_run
CREATE INDEX idx_automation_run_steps_run ON automation_run_steps(run_id, created_at);

-- [index] idx_automation_runs_automation
CREATE INDEX idx_automation_runs_automation ON automation_runs(automation_id, updated_at);

-- [index] idx_automation_runs_owner
CREATE INDEX idx_automation_runs_owner ON automation_runs(owner_type, owner_id, updated_at);

-- [index] idx_automation_runs_project
CREATE INDEX idx_automation_runs_project ON automation_runs(project_id);

-- [index] idx_automation_runs_session
CREATE INDEX idx_automation_runs_session ON automation_runs(session_id, updated_at);

-- [index] idx_automation_runs_status
CREATE INDEX idx_automation_runs_status ON automation_runs(status, updated_at);

-- [index] idx_calendar_accounts_provider
CREATE INDEX idx_calendar_accounts_provider ON calendar_accounts(provider);

-- [index] idx_calendar_calendars_account
CREATE INDEX idx_calendar_calendars_account ON calendar_calendars(account_id);

-- [index] idx_calendar_event_links_event
CREATE INDEX idx_calendar_event_links_event ON calendar_event_links(event_id);

-- [index] idx_calendar_event_links_remote
CREATE INDEX idx_calendar_event_links_remote ON calendar_event_links(provider, remote_event_id);

-- [index] idx_calendar_events_calendar
CREATE INDEX idx_calendar_events_calendar ON calendar_events(calendar_id);

-- [index] idx_calendar_events_range
CREATE INDEX idx_calendar_events_range ON calendar_events(start_at, end_at);

-- [index] idx_calendar_events_start
CREATE INDEX idx_calendar_events_start ON calendar_events(start_at);

-- [index] idx_calendar_notifications_event
CREATE INDEX idx_calendar_notifications_event ON calendar_notifications(event_id);

-- [index] idx_calendar_notifications_pending
CREATE INDEX idx_calendar_notifications_pending ON calendar_notifications(notify_at, notified_at);

-- [index] idx_canvas_workflows_folder_id
CREATE INDEX idx_canvas_workflows_folder_id ON canvas_workflows(folder_id);

-- [index] idx_canvas_workflows_project_id
CREATE INDEX idx_canvas_workflows_project_id ON canvas_workflows(project_id);

-- [index] idx_canvas_workflows_updated_at
CREATE INDEX idx_canvas_workflows_updated_at ON canvas_workflows(updated_at);

-- [index] idx_chat_messages_created
CREATE INDEX idx_chat_messages_created ON chat_messages(created_at);

-- [index] idx_chat_messages_session
CREATE INDEX idx_chat_messages_session ON chat_messages(session_id);

-- [index] idx_chat_sessions_agent
CREATE INDEX idx_chat_sessions_agent ON chat_sessions(agent_id);

-- [index] idx_chat_sessions_context
CREATE INDEX idx_chat_sessions_context ON chat_sessions(context_id);

-- [index] idx_chat_sessions_mode
CREATE INDEX idx_chat_sessions_mode ON chat_sessions(mode);

-- [index] idx_chat_sessions_project
CREATE INDEX idx_chat_sessions_project ON chat_sessions(project_id);

-- [index] idx_chat_sessions_resource
CREATE INDEX idx_chat_sessions_resource ON chat_sessions(resource_id);

-- [index] idx_chat_sessions_updated
CREATE INDEX idx_chat_sessions_updated ON chat_sessions(updated_at);

-- [index] idx_chat_traces_message
CREATE INDEX idx_chat_traces_message ON chat_traces(message_id);

-- [index] idx_chat_traces_session
CREATE INDEX idx_chat_traces_session ON chat_traces(session_id);

-- [index] idx_email_accounts_email
CREATE INDEX idx_email_accounts_email ON email_accounts(email);

-- [index] idx_feeder_runs_feeder
CREATE INDEX idx_feeder_runs_feeder ON feeder_runs(feeder_id, started_at DESC);

-- [index] idx_feeder_secrets_name
CREATE INDEX idx_feeder_secrets_name ON feeder_secrets(name);

-- [index] idx_feeders_artifact
CREATE INDEX idx_feeders_artifact ON feeders(artifact_resource_id);

-- [index] idx_feeders_enabled
CREATE INDEX idx_feeders_enabled ON feeders(enabled, approved);

-- [index] idx_flashcard_decks_project
CREATE INDEX idx_flashcard_decks_project ON flashcard_decks(project_id);

-- [index] idx_flashcard_decks_resource
CREATE INDEX idx_flashcard_decks_resource ON flashcard_decks(resource_id);

-- [index] idx_flashcard_sessions_deck
CREATE INDEX idx_flashcard_sessions_deck ON flashcard_sessions(deck_id);

-- [index] idx_flashcards_deck
CREATE INDEX idx_flashcards_deck ON flashcards(deck_id);

-- [index] idx_flashcards_next_review
CREATE INDEX idx_flashcards_next_review ON flashcards(next_review_at);

-- [index] idx_github_branches_repo
CREATE INDEX idx_github_branches_repo ON github_branches(repo_id);

-- [index] idx_github_calendar_links_event
CREATE INDEX idx_github_calendar_links_event ON github_calendar_links(event_id);

-- [index] idx_github_issues_dirty
CREATE INDEX idx_github_issues_dirty ON github_issues(dirty);

-- [index] idx_github_issues_milestone
CREATE INDEX idx_github_issues_milestone ON github_issues(repo_id, milestone_number);

-- [index] idx_github_issues_repo
CREATE INDEX idx_github_issues_repo ON github_issues(repo_id);

-- [index] idx_github_milestones_dirty
CREATE INDEX idx_github_milestones_dirty ON github_milestones(dirty);

-- [index] idx_github_milestones_repo
CREATE INDEX idx_github_milestones_repo ON github_milestones(repo_id);

-- [index] idx_github_releases_repo
CREATE INDEX idx_github_releases_repo ON github_releases(repo_id);

-- [index] idx_github_repos_selected
CREATE INDEX idx_github_repos_selected ON github_repos(selected);

-- [index] idx_graph_edges_relation
CREATE INDEX idx_graph_edges_relation ON graph_edges(relation);

-- [index] idx_graph_edges_source
CREATE INDEX idx_graph_edges_source ON graph_edges(source_id);

-- [index] idx_graph_edges_target
CREATE INDEX idx_graph_edges_target ON graph_edges(target_id);

-- [index] idx_graph_nodes_label
CREATE INDEX idx_graph_nodes_label ON graph_nodes(label);

-- [index] idx_graph_nodes_resource
CREATE INDEX idx_graph_nodes_resource ON graph_nodes(resource_id);

-- [index] idx_graph_nodes_type
CREATE INDEX idx_graph_nodes_type ON graph_nodes(type);

-- [index] idx_interactions_resource
CREATE INDEX idx_interactions_resource ON resource_interactions(resource_id);

-- [index] idx_interactions_type
CREATE INDEX idx_interactions_type ON resource_interactions(type);

-- [index] idx_many_agent_versions_agent_id
CREATE INDEX idx_many_agent_versions_agent_id ON many_agent_versions (agent_id);

-- [index] idx_many_agent_versions_agent_version
CREATE UNIQUE INDEX idx_many_agent_versions_agent_version
          ON many_agent_versions (agent_id, version_number);

-- [index] idx_many_agents_folder_id
CREATE INDEX idx_many_agents_folder_id ON many_agents(folder_id);

-- [index] idx_many_agents_marketplace_id
CREATE INDEX idx_many_agents_marketplace_id ON many_agents(marketplace_id);

-- [index] idx_many_agents_project_id
CREATE INDEX idx_many_agents_project_id ON many_agents(project_id);

-- [index] idx_mcp_servers_name
CREATE INDEX idx_mcp_servers_name ON mcp_servers(name);

-- [index] idx_quiz_runs_completed
CREATE INDEX idx_quiz_runs_completed ON quiz_runs(completed_at DESC);

-- [index] idx_quiz_runs_output
CREATE INDEX idx_quiz_runs_output ON quiz_runs(studio_output_id);

-- [index] idx_resource_chunks_model
CREATE INDEX idx_resource_chunks_model ON resource_chunks(model_version);

-- [index] idx_resource_chunks_resource
CREATE INDEX idx_resource_chunks_resource ON resource_chunks(resource_id);

-- [index] idx_resource_transcripts_resource
CREATE INDEX idx_resource_transcripts_resource ON resource_transcripts(resource_id);

-- [index] idx_resource_transcripts_resource_hash
CREATE INDEX idx_resource_transcripts_resource_hash ON resource_transcripts(resource_id, file_hash);

-- [index] idx_resources_file_hash
CREATE INDEX idx_resources_file_hash ON resources(file_hash);

-- [index] idx_resources_folder
CREATE INDEX idx_resources_folder ON resources(folder_id);

-- [index] idx_resources_internal_path
CREATE INDEX idx_resources_internal_path ON resources(internal_path);

-- [index] idx_resources_project
CREATE INDEX idx_resources_project ON resources(project_id);

-- [index] idx_resources_type
CREATE INDEX idx_resources_type ON resources(type);

-- [index] idx_resources_vault_path
CREATE INDEX idx_resources_vault_path ON resources(vault_path);

-- [index] idx_search_index_resource
CREATE INDEX idx_search_index_resource ON search_index(resource_id);

-- [index] idx_semantic_sim
CREATE INDEX idx_semantic_sim ON semantic_relations(similarity DESC);

-- [index] idx_semantic_source
CREATE INDEX idx_semantic_source ON semantic_relations(source_id);

-- [index] idx_semantic_target
CREATE INDEX idx_semantic_target ON semantic_relations(target_id);

-- [index] idx_sources_resource
CREATE INDEX idx_sources_resource ON sources(resource_id);

-- [index] idx_studio_outputs_deck
CREATE INDEX idx_studio_outputs_deck ON studio_outputs(deck_id);

-- [index] idx_studio_outputs_project
CREATE INDEX idx_studio_outputs_project ON studio_outputs(project_id);

-- [index] idx_studio_outputs_resource
CREATE INDEX idx_studio_outputs_resource ON studio_outputs(resource_id);

-- [index] idx_studio_outputs_type
CREATE INDEX idx_studio_outputs_type ON studio_outputs(type);

-- [index] idx_study_events_deck
CREATE INDEX idx_study_events_deck ON study_events(deck_id);

-- [index] idx_study_events_kind
CREATE INDEX idx_study_events_kind ON study_events(kind);

-- [index] idx_study_events_project
CREATE INDEX idx_study_events_project ON study_events(project_id);

-- [index] idx_study_events_started
CREATE INDEX idx_study_events_started ON study_events(started_at);

-- [index] idx_transcription_sessions_project
CREATE INDEX idx_transcription_sessions_project ON transcription_sessions(project_id);

-- [index] idx_transcription_sessions_status
CREATE INDEX idx_transcription_sessions_status ON transcription_sessions(status);

-- [index] idx_workflow_executions_project_id
CREATE INDEX idx_workflow_executions_project_id ON workflow_executions(project_id);

-- [index] idx_workflow_executions_started_at
CREATE INDEX idx_workflow_executions_started_at ON workflow_executions(started_at);

-- [index] idx_workflow_executions_workflow_id
CREATE INDEX idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);

-- [index] idx_workflow_folders_parent
CREATE INDEX idx_workflow_folders_parent ON workflow_folders(parent_id);

-- [index] idx_workflow_folders_project_id
CREATE INDEX idx_workflow_folders_project_id ON workflow_folders(project_id);

-- [trigger] interactions_ad
CREATE TRIGGER interactions_ad AFTER DELETE ON resource_interactions BEGIN
      DELETE FROM interactions_fts WHERE interaction_id = old.id;
    END;

-- [trigger] interactions_ai
CREATE TRIGGER interactions_ai AFTER INSERT ON resource_interactions BEGIN
      INSERT INTO interactions_fts(interaction_id, content)
      VALUES (
        new.id, 
        COALESCE(new.content, '') || ' ' || COALESCE(json_extract(new.position_data, '$.selectedText'), '')
      );
    END;

-- [trigger] interactions_au
CREATE TRIGGER interactions_au AFTER UPDATE ON resource_interactions BEGIN
      DELETE FROM interactions_fts WHERE interaction_id = old.id;
      INSERT INTO interactions_fts(interaction_id, content)
      VALUES (
        new.id, 
        COALESCE(new.content, '') || ' ' || COALESCE(json_extract(new.position_data, '$.selectedText'), '')
      );
    END;

-- [trigger] resources_ad
CREATE TRIGGER resources_ad AFTER DELETE ON resources BEGIN
              DELETE FROM resources_fts WHERE resource_id = old.id;
            END;

-- [trigger] resources_ai
CREATE TRIGGER resources_ai AFTER INSERT ON resources BEGIN
          INSERT INTO resources_fts(resource_id, title, content)
          VALUES (new.id, new.title, COALESCE(NULLIF(new.content_text, ''), new.content, ''));
        END;

-- [trigger] resources_au
CREATE TRIGGER resources_au AFTER UPDATE ON resources BEGIN
          DELETE FROM resources_fts WHERE resource_id = old.id;
          INSERT INTO resources_fts(resource_id, title, content)
          VALUES (new.id, new.title, COALESCE(NULLIF(new.content_text, ''), new.content, ''));
        END;

-- [trigger] trg_flashcards_count_ad
CREATE TRIGGER trg_flashcards_count_ad
        AFTER DELETE ON flashcards
        BEGIN
          UPDATE flashcard_decks SET card_count = (SELECT COUNT(*) FROM flashcards WHERE deck_id = OLD.deck_id) WHERE id = OLD.deck_id;
        END;

-- [trigger] trg_flashcards_count_ai
CREATE TRIGGER trg_flashcards_count_ai
        AFTER INSERT ON flashcards
        BEGIN
          UPDATE flashcard_decks SET card_count = (SELECT COUNT(*) FROM flashcards WHERE deck_id = NEW.deck_id) WHERE id = NEW.deck_id;
        END;

-- [trigger] trg_flashcards_count_au
CREATE TRIGGER trg_flashcards_count_au
        AFTER UPDATE OF deck_id ON flashcards
        WHEN OLD.deck_id IS NOT NEW.deck_id
        BEGIN
          UPDATE flashcard_decks SET card_count = (SELECT COUNT(*) FROM flashcards WHERE deck_id = OLD.deck_id) WHERE id = OLD.deck_id;
          UPDATE flashcard_decks SET card_count = (SELECT COUNT(*) FROM flashcards WHERE deck_id = NEW.deck_id) WHERE id = NEW.deck_id;
        END;
