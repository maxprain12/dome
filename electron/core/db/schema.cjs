/* eslint-disable no-console */
/**
 * Base SQLite schema DDL — squashed baseline at schema v69 (social_campaigns).
 *
 * `createBaseSchema(db)` runs the PRAGMAs and creates every base table,
 * index, FTS virtual table and trigger with `IF NOT EXISTS` (idempotent).
 * It reflects the FULL schema at HEAD: the old 64-step migration chain was
 * squashed — a fresh install gets this schema and schema_version=HEAD directly;
 * existing installs at v50–HEAD-1 are upgraded by db/migrations.cjs (kept chain
 * 50→64 + v65–v69). Installs below v50 are not supported (clear error).
 *
 * Removed dead tables (v65): martin_memory, agent_store, auth_profiles,
 * resource_links_legacy, search_index, note_embeddings, resource_images,
 * dome_cloud_sync, cloud_blob_state (bundle sync v3) and the *_new /
 * github_repos_v57 migration scratch tables.
 *
 * New in v65: vault_blobs, many_session_index.
 * New in v66: people + person_identities.
 * New in v67: email_folders, email_messages, email_sync_state.
 * New in v68: source_documents + source_documents_fts (integration search).
 * New in v69: social_campaigns + social_posts.campaign_id.
 *
 * When you change a table here, also add a migration in db/migrations.cjs so
 * existing installs converge — this file only helps brand-new databases.
 * Indexes on columns added by migrations must be guarded (IF NOT EXISTS alone
 * is not enough when CREATE TABLE IF NOT EXISTS skips an older table shape).
 */

function applyJournalMode(db) {
  try {
    const mode = db.pragma('journal_mode = WAL', { simple: true });
    if (String(mode || '').toLowerCase() !== 'wal') {
      console.warn('[DB] Requested WAL journal_mode but SQLite returned:', mode);
    }
  } catch (err) {
    const code = String(err?.code || '');
    const message = String(err?.message || '');
    const isIo = code.startsWith('SQLITE_IOERR') || message.includes('disk I/O error');
    if (!isIo) throw err;
    console.warn('[DB] WAL journal_mode I/O error, falling back to DELETE:', message);
    db.pragma('journal_mode = DELETE');
  }
}

function createBaseSchema(db) {
  // Enable optimizations
  db.exec('PRAGMA foreign_keys = ON');
  applyJournalMode(db);
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA temp_store = MEMORY');
  db.exec('PRAGMA mmap_size = 30000000000');
  // INCREMENTAL auto-vacuum lets us reclaim freed pages (PRAGMA incremental_vacuum)
  // after deleting large rows instead of letting the file grow forever.
  try {
    db.exec('PRAGMA auto_vacuum = INCREMENTAL');
  } catch (err) {
    console.warn('[DB] Could not set auto_vacuum = INCREMENTAL:', err?.message || err);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_folders (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL DEFAULT 'default' REFERENCES projects(id) ON DELETE CASCADE,
          parent_id TEXT,
          name TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_skills (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          prompt TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS artifact_runtime_data (
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
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS artifacts (
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
        )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS automation_artifact_bindings (
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
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS automation_definitions (
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
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS automation_run_links (
              id TEXT PRIMARY KEY,
              run_id TEXT NOT NULL,
              link_type TEXT NOT NULL,
              link_id TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              FOREIGN KEY (run_id) REFERENCES automation_runs(id) ON DELETE CASCADE
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS automation_run_steps (
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
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS automation_runs (
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
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_accounts (
              id TEXT PRIMARY KEY,
              provider TEXT NOT NULL CHECK(provider IN ('google', 'local')),
              account_email TEXT NOT NULL,
              credentials TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disconnected', 'error')),
              last_sync_at INTEGER,
              sync_token TEXT,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            , project_id TEXT NOT NULL DEFAULT 'default')
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_calendars (
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
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_event_links (
              id TEXT PRIMARY KEY,
              event_id TEXT NOT NULL,
              provider TEXT NOT NULL,
              remote_event_id TEXT NOT NULL,
              remote_calendar_id TEXT,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE CASCADE,
              UNIQUE(provider, remote_event_id)
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_events (
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
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_notifications (
              id TEXT PRIMARY KEY,
              event_id TEXT NOT NULL,
              notify_at INTEGER NOT NULL,
              notified_at INTEGER,
              created_at INTEGER NOT NULL,
              FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE CASCADE,
              UNIQUE(event_id, notify_at)
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS canvas_workflows (
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
        )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
              id TEXT PRIMARY KEY,
              session_id TEXT NOT NULL,
              role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
              content TEXT NOT NULL,
              tool_calls TEXT,
              thinking TEXT,
              metadata TEXT,
              created_at INTEGER NOT NULL,
              FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
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
            , project_id TEXT NOT NULL DEFAULT 'default')
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_traces (
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
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS domain_sync_state (
              domain TEXT PRIMARY KEY,
              last_pull_cursor TEXT NOT NULL DEFAULT '0',
              last_push_at INTEGER NOT NULL DEFAULT 0,
              enabled INTEGER NOT NULL DEFAULT 1,
              updated_at INTEGER NOT NULL
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS dome_provider_sessions (
          user_id TEXT PRIMARY KEY,
          access_token TEXT NOT NULL,
          refresh_token TEXT,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS email_accounts (
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
            , user_actions TEXT NOT NULL DEFAULT '{"list":true,"read":true,"search":true,"send":true,"reply":true}', agent_actions TEXT NOT NULL DEFAULT '{"list":true,"read":true,"search":true,"send":false,"reply":false}', project_id TEXT NOT NULL DEFAULT 'default')
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS email_folders (
              id TEXT PRIMARY KEY,
              account_id TEXT NOT NULL,
              remote_name TEXT NOT NULL,
              role TEXT,
              uidvalidity INTEGER,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE,
              UNIQUE(account_id, remote_name)
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS email_messages (
              id TEXT PRIMARY KEY,
              account_id TEXT NOT NULL,
              folder_id TEXT NOT NULL,
              uid TEXT NOT NULL,
              message_id TEXT,
              subject TEXT,
              from_json TEXT,
              to_json TEXT,
              cc_json TEXT,
              date_ms INTEGER,
              snippet TEXT,
              has_attachments INTEGER NOT NULL DEFAULT 0,
              flags_json TEXT,
              body_text TEXT,
              body_html TEXT,
              synced_at INTEGER NOT NULL,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE,
              FOREIGN KEY (folder_id) REFERENCES email_folders(id) ON DELETE CASCADE,
              UNIQUE(account_id, folder_id, uid)
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS email_sync_state (
              id TEXT PRIMARY KEY,
              account_id TEXT NOT NULL,
              folder_id TEXT NOT NULL,
              last_uid TEXT,
              cursor TEXT,
              last_synced_at INTEGER,
              status TEXT,
              error TEXT,
              updated_at INTEGER NOT NULL,
              FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE,
              FOREIGN KEY (folder_id) REFERENCES email_folders(id) ON DELETE CASCADE,
              UNIQUE(account_id, folder_id)
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS feeder_runs (
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
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS feeder_secrets (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL UNIQUE,
              encrypted_value BLOB NOT NULL,
              last_used_at INTEGER,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS feeders (
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
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS flashcard_decks (
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
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS flashcard_sessions (
              id TEXT PRIMARY KEY,
              deck_id TEXT NOT NULL,
              cards_studied INTEGER DEFAULT 0,
              cards_correct INTEGER DEFAULT 0,
              cards_incorrect INTEGER DEFAULT 0,
              duration_ms INTEGER DEFAULT 0,
              started_at INTEGER NOT NULL,
              completed_at INTEGER,
              FOREIGN KEY (deck_id) REFERENCES flashcard_decks(id) ON DELETE CASCADE
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS flashcards (
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
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS github_branches (
              id TEXT PRIMARY KEY,
              repo_id TEXT NOT NULL,
              name TEXT NOT NULL,
              sha TEXT,
              protected INTEGER DEFAULT 0,
              linked_issue_number INTEGER,
              updated_at INTEGER NOT NULL,
              FOREIGN KEY (repo_id) REFERENCES github_repos(id) ON DELETE CASCADE,
              UNIQUE(repo_id, name)
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS github_calendar_links (
              id TEXT PRIMARY KEY,
              entity_type TEXT NOT NULL CHECK(entity_type IN ('milestone', 'issue', 'release')),
              entity_id TEXT NOT NULL,
              event_id TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE CASCADE,
              UNIQUE(entity_type, entity_id)
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS github_issues (
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
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS github_milestones (
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
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS github_releases (
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
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS github_repos (
                  id TEXT PRIMARY KEY,
                  remote_id INTEGER NOT NULL,
                  owner TEXT NOT NULL,
                  name TEXT NOT NULL,
                  full_name TEXT NOT NULL,
                  private INTEGER DEFAULT 0,
                  html_url TEXT,
                  selected INTEGER DEFAULT 0,
                  last_sync_at INTEGER,
                  project_id TEXT NOT NULL DEFAULT 'default',
                  created_at INTEGER NOT NULL,
                  updated_at INTEGER NOT NULL,
                  UNIQUE(full_name, project_id)
                )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS github_sync_state (
              id TEXT PRIMARY KEY,
              repo_id TEXT NOT NULL,
              resource TEXT NOT NULL,
              etag TEXT,
              last_synced_at INTEGER,
              FOREIGN KEY (repo_id) REFERENCES github_repos(id) ON DELETE CASCADE,
              UNIQUE(repo_id, resource)
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS graph_edges (
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
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS graph_nodes (
              id TEXT PRIMARY KEY,
              resource_id TEXT,
              label TEXT NOT NULL,
              type TEXT NOT NULL CHECK(type IN ('resource', 'concept', 'person', 'location', 'event', 'topic')),
              properties TEXT,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
            )
  `);

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS interactions_fts USING fts5(
          interaction_id,
          content
        )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS learn_kpis_cache (
              scope TEXT PRIMARY KEY,
              payload TEXT NOT NULL,
              computed_at INTEGER NOT NULL
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS many_agent_versions (
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
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS many_agents (
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
        )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS marketplace_agent_installs (
          marketplace_id TEXT PRIMARY KEY,
          local_agent_id TEXT NOT NULL,
          version TEXT,
          author TEXT,
          source TEXT,
          installed_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          capabilities_json TEXT NOT NULL DEFAULT '[]',
          resource_affinity_json TEXT NOT NULL DEFAULT '[]'
        )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS marketplace_template_mappings (
          template_id TEXT PRIMARY KEY,
          workflow_id TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS marketplace_workflow_installs (
          template_id TEXT PRIMARY KEY,
          local_workflow_id TEXT NOT NULL,
          version TEXT,
          author TEXT,
          source TEXT,
          installed_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          capabilities_json TEXT NOT NULL DEFAULT '[]',
          resource_affinity_json TEXT NOT NULL DEFAULT '[]'
        )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_global_settings (
          id INTEGER PRIMARY KEY CHECK(id = 1),
          enabled INTEGER NOT NULL DEFAULT 1,
          updated_at INTEGER NOT NULL
        )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_servers (
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
        )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_item_events (
              id TEXT PRIMARY KEY,
              item_id TEXT NOT NULL,
              project_id TEXT NOT NULL DEFAULT 'default',
              event_type TEXT NOT NULL,
              actor TEXT,
              summary TEXT,
              detail_json TEXT,
              run_id TEXT,
              created_at INTEGER NOT NULL,
              FOREIGN KEY (item_id) REFERENCES pipeline_items(id) ON DELETE CASCADE,
              FOREIGN KEY (run_id) REFERENCES automation_runs(id) ON DELETE SET NULL
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_items (
              id TEXT PRIMARY KEY,
              pipeline_id TEXT NOT NULL,
              project_id TEXT NOT NULL DEFAULT 'default',
              stage_id TEXT NOT NULL,
              source_id TEXT,
              title TEXT NOT NULL,
              position INTEGER NOT NULL DEFAULT 0,
              data_json TEXT,
              exec_status TEXT NOT NULL DEFAULT 'pending'
                CHECK(exec_status IN ('pending', 'running', 'ready', 'failed', 'blocked')),
              assigned_kind TEXT NOT NULL DEFAULT 'unassigned'
                CHECK(assigned_kind IN ('unassigned', 'agent', 'manual', 'auto')),
              assigned_agent_id TEXT,
              current_run_id TEXT,
              last_output TEXT,
              start_at INTEGER,
              end_at INTEGER,
              calendar_event_id TEXT,
              metadata_json TEXT,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE,
              FOREIGN KEY (stage_id) REFERENCES pipeline_stages(id) ON DELETE CASCADE,
              FOREIGN KEY (source_id) REFERENCES pipeline_sources(id) ON DELETE SET NULL,
              FOREIGN KEY (assigned_agent_id) REFERENCES many_agents(id) ON DELETE SET NULL,
              FOREIGN KEY (current_run_id) REFERENCES automation_runs(id) ON DELETE SET NULL,
              FOREIGN KEY (calendar_event_id) REFERENCES calendar_events(id) ON DELETE SET NULL
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS people (
              id TEXT PRIMARY KEY,
              project_id TEXT NOT NULL DEFAULT 'default',
              display_name TEXT NOT NULL,
              primary_email TEXT,
              avatar_url TEXT,
              notes TEXT,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS person_identities (
              id TEXT PRIMARY KEY,
              person_id TEXT NOT NULL,
              project_id TEXT NOT NULL DEFAULT 'default',
              source TEXT NOT NULL
                CHECK(source IN ('github', 'email', 'social_x', 'social_linkedin', 'social_instagram', 'manual')),
              external_id TEXT NOT NULL,
              display_label TEXT,
              meta_json TEXT,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
              UNIQUE(project_id, source, external_id)
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_sources (
              id TEXT PRIMARY KEY,
              pipeline_id TEXT NOT NULL,
              project_id TEXT NOT NULL DEFAULT 'default',
              name TEXT NOT NULL,
              source_type TEXT NOT NULL
                CHECK(source_type IN ('internal_resources', 'excel', 'manual', 'external_db', 'prompt_mcp')),
              config_json TEXT,
              target_stage_id TEXT,
              enabled INTEGER NOT NULL DEFAULT 1,
              last_sync_at INTEGER,
              last_sync_status TEXT,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE,
              FOREIGN KEY (target_stage_id) REFERENCES pipeline_stages(id) ON DELETE SET NULL
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_stages (
              id TEXT PRIMARY KEY,
              pipeline_id TEXT NOT NULL,
              project_id TEXT NOT NULL DEFAULT 'default',
              title TEXT NOT NULL,
              position INTEGER NOT NULL DEFAULT 0,
              execution_policy TEXT NOT NULL DEFAULT 'manual_resolve'
                CHECK(execution_policy IN ('auto_agent', 'manual_agent', 'manual_resolve')),
              assigned_agent_id TEXT,
              assigned_workflow_id TEXT,
              run_input_template TEXT,
              provider TEXT,
              model TEXT,
              is_terminal INTEGER NOT NULL DEFAULT 0,
              wip_limit INTEGER,
              config_json TEXT,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE,
              FOREIGN KEY (assigned_agent_id) REFERENCES many_agents(id) ON DELETE SET NULL,
              FOREIGN KEY (assigned_workflow_id) REFERENCES canvas_workflows(id) ON DELETE SET NULL
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS pipelines (
              id TEXT PRIMARY KEY,
              project_id TEXT NOT NULL DEFAULT 'default',
              name TEXT NOT NULL,
              description TEXT,
              icon_index INTEGER NOT NULL DEFAULT 0,
              color TEXT,
              folder_id TEXT,
              archived INTEGER NOT NULL DEFAULT 0,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          parent_id TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL, vault_root TEXT,
          FOREIGN KEY (parent_id) REFERENCES projects(id) ON DELETE CASCADE
        )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS quiz_runs (
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
              )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS resource_chunks (
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
        )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS resource_interactions (
          id TEXT PRIMARY KEY,
          resource_id TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('note', 'annotation', 'chat')),
          content TEXT NOT NULL,
          position_data TEXT,
          metadata TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
        )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS resource_tags (
          resource_id TEXT NOT NULL,
          tag_id TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (resource_id, tag_id),
          FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
          FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS resource_transcripts (
              resource_id TEXT NOT NULL,
              page_number INTEGER NOT NULL,
              markdown TEXT NOT NULL,
              model_used TEXT,
              file_hash TEXT,
              created_at INTEGER NOT NULL,
              PRIMARY KEY (resource_id, page_number),
              FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS resources (
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
                )
  `);

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS resources_fts USING fts5(
          resource_id,
          title,
          content
        )
  `);

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS source_documents_fts USING fts5(
          doc_id UNINDEXED,
          title,
          body
        )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS semantic_relations (
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
        )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS social_account_metrics (
              id TEXT PRIMARY KEY,
              account_id TEXT NOT NULL,
              captured_at INTEGER NOT NULL,
              followers INTEGER,
              following INTEGER,
              posts_count INTEGER,
              raw TEXT, updated_at INTEGER,
              FOREIGN KEY (account_id) REFERENCES social_accounts(id) ON DELETE CASCADE
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS social_accounts (
              id TEXT PRIMARY KEY,
              provider TEXT NOT NULL CHECK(provider IN ('linkedin', 'instagram', 'x')),
              display_name TEXT,
              handle TEXT,
              external_id TEXT,
              credentials BLOB,
              scopes TEXT,
              status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'error', 'expired')),
              last_error TEXT,
              connected_at INTEGER,
              last_sync_at INTEGER,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            , account_kind TEXT NOT NULL DEFAULT 'member', cloud_publishing INTEGER NOT NULL DEFAULT 0)
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS social_metrics (
              id TEXT PRIMARY KEY,
              post_id TEXT NOT NULL,
              captured_at INTEGER NOT NULL,
              impressions INTEGER,
              likes INTEGER,
              comments INTEGER,
              shares INTEGER,
              saves INTEGER,
              clicks INTEGER,
              followers INTEGER,
              raw TEXT, updated_at INTEGER,
              FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS social_campaigns (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL UNIQUE,
              goal TEXT,
              status TEXT NOT NULL DEFAULT 'active'
                CHECK(status IN ('active', 'archived')),
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS social_posts (
              id TEXT PRIMARY KEY,
              account_id TEXT,
              provider TEXT NOT NULL CHECK(provider IN ('linkedin', 'instagram', 'x')),
              status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'scheduled', 'publishing', 'published', 'failed')),
              body TEXT NOT NULL DEFAULT '',
              media TEXT NOT NULL DEFAULT '[]',
              link_url TEXT,
              topics TEXT NOT NULL DEFAULT '[]',
              campaign TEXT,
              campaign_id TEXT,
              scheduled_at INTEGER,
              published_at INTEGER,
              external_post_id TEXT,
              external_url TEXT,
              error TEXT,
              created_by TEXT NOT NULL DEFAULT 'user',
              group_id TEXT,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL, media_storage TEXT NOT NULL DEFAULT '[]',
              FOREIGN KEY (account_id) REFERENCES social_accounts(id) ON DELETE SET NULL,
              FOREIGN KEY (campaign_id) REFERENCES social_campaigns(id) ON DELETE SET NULL
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS social_reports (
              id TEXT PRIMARY KEY,
              status TEXT NOT NULL DEFAULT 'generating' CHECK(status IN ('generating', 'ready', 'failed')),
              trigger TEXT NOT NULL DEFAULT 'user' CHECK(trigger IN ('user', 'auto')),
              period_days INTEGER NOT NULL DEFAULT 30,
              title TEXT,
              content TEXT,
              model TEXT,
              error TEXT,
              data TEXT,
              created_at INTEGER NOT NULL,
              completed_at INTEGER
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS source_documents (
              id TEXT PRIMARY KEY,
              kind TEXT NOT NULL CHECK(kind IN ('issue', 'email', 'person', 'social_post')),
              source_id TEXT NOT NULL,
              project_id TEXT NOT NULL DEFAULT 'default',
              title TEXT,
              body TEXT,
              meta_json TEXT,
              updated_at INTEGER NOT NULL
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
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
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS studio_outputs (
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
              )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS study_events (
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
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_tombstones (
              table_name TEXT NOT NULL,
              row_id TEXT NOT NULL,
              deleted_at INTEGER NOT NULL,
              synced INTEGER NOT NULL DEFAULT 0,
              PRIMARY KEY (table_name, row_id)
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS synced_settings (
              id TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              updated_at INTEGER NOT NULL,
              device_id TEXT,
              deleted_at INTEGER
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
          id TEXT PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          color TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL DEFAULT 0
        )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS transcription_chunks (
              session_id TEXT NOT NULL,
              seq INTEGER NOT NULL,
              track TEXT NOT NULL CHECK(track IN ('mic','system')),
              start_ms INTEGER NOT NULL,
              duration_ms INTEGER,
              file_path TEXT NOT NULL,
              text TEXT,
              PRIMARY KEY (session_id, track, seq),
              FOREIGN KEY (session_id) REFERENCES transcription_sessions(id) ON DELETE CASCADE
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS transcription_sessions (
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
            )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_executions (
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
        )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_folders (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL DEFAULT 'default' REFERENCES projects(id) ON DELETE CASCADE,
          parent_id TEXT,
          name TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_folders_parent ON agent_folders(parent_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_folders_project_id ON agent_folders(project_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ai_skills_enabled ON ai_skills(enabled)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_artifact_runtime_data_artifact ON artifact_runtime_data(artifact_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_artifact_runtime_data_auto ON artifact_runtime_data(last_automation_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_artifacts_resource ON artifacts(resource_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(artifact_type)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_auto_art_bindings_auto ON automation_artifact_bindings(automation_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_auto_art_bindings_res ON automation_artifact_bindings(artifact_resource_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_automation_definitions_project ON automation_definitions(project_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_automation_definitions_target ON automation_definitions(target_type, target_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_automation_definitions_trigger ON automation_definitions(trigger_type, enabled)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_automation_run_links_run ON automation_run_links(run_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_automation_run_steps_run ON automation_run_steps(run_id, created_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_automation_runs_automation ON automation_runs(automation_id, updated_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_automation_runs_owner ON automation_runs(owner_type, owner_id, updated_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_automation_runs_project ON automation_runs(project_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_automation_runs_session ON automation_runs(session_id, updated_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_automation_runs_status ON automation_runs(status, updated_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_calendar_accounts_project ON calendar_accounts(project_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_calendar_accounts_provider ON calendar_accounts(provider)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_calendar_calendars_account ON calendar_calendars(account_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_calendar_event_links_event ON calendar_event_links(event_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_calendar_event_links_remote ON calendar_event_links(provider, remote_event_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_calendar_events_calendar ON calendar_events(calendar_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_calendar_events_range ON calendar_events(start_at, end_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(start_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_calendar_notifications_event ON calendar_notifications(event_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_calendar_notifications_pending ON calendar_notifications(notify_at, notified_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_canvas_workflows_folder_id ON canvas_workflows(folder_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_canvas_workflows_project_id ON canvas_workflows(project_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_canvas_workflows_updated_at ON canvas_workflows(updated_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_agent ON chat_sessions(agent_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_context ON chat_sessions(context_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_mode ON chat_sessions(mode)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_project ON chat_sessions(project_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_resource ON chat_sessions(resource_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chat_traces_message ON chat_traces(message_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chat_traces_session ON chat_traces(session_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_email_accounts_email ON email_accounts(email)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_email_accounts_project ON email_accounts(project_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_email_folders_account ON email_folders(account_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_email_messages_folder ON email_messages(folder_id, date_ms DESC)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_email_messages_account ON email_messages(account_id, date_ms DESC)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_feeder_runs_feeder ON feeder_runs(feeder_id, started_at DESC)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_feeder_secrets_name ON feeder_secrets(name)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_feeders_artifact ON feeders(artifact_resource_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_feeders_enabled ON feeders(enabled, approved)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_flashcard_decks_project ON flashcard_decks(project_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_flashcard_decks_resource ON flashcard_decks(resource_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_flashcard_sessions_deck ON flashcard_sessions(deck_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_flashcards_deck ON flashcards(deck_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_flashcards_next_review ON flashcards(next_review_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_github_branches_repo ON github_branches(repo_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_github_calendar_links_event ON github_calendar_links(event_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_github_issues_dirty ON github_issues(dirty)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_github_issues_milestone ON github_issues(repo_id, milestone_number)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_github_issues_repo ON github_issues(repo_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_github_milestones_dirty ON github_milestones(dirty)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_github_milestones_repo ON github_milestones(repo_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_github_releases_repo ON github_releases(repo_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_github_repos_project ON github_repos(project_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_github_repos_project_selected ON github_repos(project_id, selected)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_github_repos_selected ON github_repos(selected)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_graph_edges_relation ON graph_edges(relation)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_graph_nodes_label ON graph_nodes(label)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_graph_nodes_resource ON graph_nodes(resource_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON graph_nodes(type)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_interactions_resource ON resource_interactions(resource_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_interactions_type ON resource_interactions(type)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_many_agent_versions_agent_id ON many_agent_versions (agent_id)
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_many_agent_versions_agent_version
              ON many_agent_versions (agent_id, version_number)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_many_agents_folder_id ON many_agents(folder_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_many_agents_marketplace_id ON many_agents(marketplace_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_many_agents_project_id ON many_agents(project_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mcp_servers_name ON mcp_servers(name)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_pipeline_item_events_item ON pipeline_item_events(item_id, created_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_pipeline_items_pipeline ON pipeline_items(pipeline_id, updated_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_pipeline_items_range ON pipeline_items(start_at, end_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_pipeline_items_run ON pipeline_items(current_run_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_pipeline_items_stage ON pipeline_items(stage_id, position)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_pipeline_sources_pipeline ON pipeline_sources(pipeline_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline ON pipeline_stages(pipeline_id, position)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_people_project ON people(project_id, updated_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_people_display_name ON people(project_id, display_name)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_person_identities_person ON person_identities(person_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_person_identities_external ON person_identities(project_id, source, external_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_pipelines_project ON pipelines(project_id, updated_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_quiz_runs_completed ON quiz_runs(completed_at DESC)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_quiz_runs_output ON quiz_runs(studio_output_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_resource_chunks_model ON resource_chunks(model_version)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_resource_chunks_resource ON resource_chunks(resource_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_resource_transcripts_resource ON resource_transcripts(resource_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_resource_transcripts_resource_hash ON resource_transcripts(resource_id, file_hash)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_resources_file_hash ON resources(file_hash)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_resources_folder ON resources(folder_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_resources_internal_path ON resources(internal_path)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_resources_project ON resources(project_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(type)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_resources_vault_path ON resources(vault_path)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_semantic_sim ON semantic_relations(similarity DESC)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_semantic_source ON semantic_relations(source_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_semantic_target ON semantic_relations(target_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_social_account_metrics ON social_account_metrics(account_id, captured_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_social_accounts_provider ON social_accounts(provider)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_social_metrics_post ON social_metrics(post_id, captured_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_social_posts_group ON social_posts(group_id)
  `);

  // Existing DBs still on v68 lack social_posts.campaign_id until migration 69;
  // CREATE TABLE IF NOT EXISTS does not add columns, so guard the index.
  try {
    const socialPostCols = db
      .prepare(`PRAGMA table_info(social_posts)`)
      .all()
      .map((c) => c.name);
    if (socialPostCols.includes('campaign_id')) {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_social_posts_campaign ON social_posts(campaign_id)
      `);
    }
  } catch (err) {
    console.warn('[DB] Could not ensure idx_social_posts_campaign:', err?.message || err);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_social_campaigns_status ON social_campaigns(status, updated_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_social_posts_provider ON social_posts(provider, published_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts(status, scheduled_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_social_reports_created ON social_reports(created_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sources_resource ON sources(resource_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_source_documents_kind_project ON source_documents(kind, project_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_source_documents_source ON source_documents(kind, source_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_studio_outputs_deck ON studio_outputs(deck_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_studio_outputs_project ON studio_outputs(project_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_studio_outputs_resource ON studio_outputs(resource_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_studio_outputs_type ON studio_outputs(type)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_study_events_deck ON study_events(deck_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_study_events_kind ON study_events(kind)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_study_events_project ON study_events(project_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_study_events_started ON study_events(started_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sync_tombstones_pending ON sync_tombstones(synced) WHERE synced = 0
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_transcription_sessions_project ON transcription_sessions(project_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_transcription_sessions_status ON transcription_sessions(status)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_workflow_executions_project_id ON workflow_executions(project_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_workflow_executions_started_at ON workflow_executions(started_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_workflow_folders_parent ON workflow_folders(parent_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_workflow_folders_project_id ON workflow_folders(project_id)
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS interactions_ad AFTER DELETE ON resource_interactions BEGIN
          DELETE FROM interactions_fts WHERE interaction_id = old.id;
        END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS interactions_ai AFTER INSERT ON resource_interactions BEGIN
          INSERT INTO interactions_fts(interaction_id, content)
          VALUES (
            new.id, 
            COALESCE(new.content, '') || ' ' || COALESCE(json_extract(new.position_data, '$.selectedText'), '')
          );
        END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS interactions_au AFTER UPDATE ON resource_interactions BEGIN
          DELETE FROM interactions_fts WHERE interaction_id = old.id;
          INSERT INTO interactions_fts(interaction_id, content)
          VALUES (
            new.id, 
            COALESCE(new.content, '') || ' ' || COALESCE(json_extract(new.position_data, '$.selectedText'), '')
          );
        END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS resources_ad AFTER DELETE ON resources BEGIN
                  DELETE FROM resources_fts WHERE resource_id = old.id;
                END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS resources_ai AFTER INSERT ON resources BEGIN
              INSERT INTO resources_fts(resource_id, title, content)
              VALUES (new.id, new.title, COALESCE(NULLIF(new.content_text, ''), new.content, ''));
            END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS resources_au AFTER UPDATE ON resources BEGIN
              DELETE FROM resources_fts WHERE resource_id = old.id;
              INSERT INTO resources_fts(resource_id, title, content)
              VALUES (new.id, new.title, COALESCE(NULLIF(new.content_text, ''), new.content, ''));
            END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_flashcards_count_ad
            AFTER DELETE ON flashcards
            BEGIN
              UPDATE flashcard_decks SET card_count = (SELECT COUNT(*) FROM flashcards WHERE deck_id = OLD.deck_id) WHERE id = OLD.deck_id;
            END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_flashcards_count_ai
            AFTER INSERT ON flashcards
            BEGIN
              UPDATE flashcard_decks SET card_count = (SELECT COUNT(*) FROM flashcards WHERE deck_id = NEW.deck_id) WHERE id = NEW.deck_id;
            END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_flashcards_count_au
            AFTER UPDATE OF deck_id ON flashcards
            WHEN OLD.deck_id IS NOT NEW.deck_id
            BEGIN
              UPDATE flashcard_decks SET card_count = (SELECT COUNT(*) FROM flashcards WHERE deck_id = OLD.deck_id) WHERE id = OLD.deck_id;
              UPDATE flashcard_decks SET card_count = (SELECT COUNT(*) FROM flashcards WHERE deck_id = NEW.deck_id) WHERE id = NEW.deck_id;
            END
  `);

  // --- v65: content-addressed vault blob manifest (files sync domain) ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS vault_blobs (
      id TEXT PRIMARY KEY,
      hash TEXT NOT NULL UNIQUE,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      mime TEXT,
      original_name TEXT,
      upload_state TEXT NOT NULL DEFAULT 'pending' CHECK(upload_state IN ('pending', 'uploaded', 'skipped')),
      local_state TEXT NOT NULL DEFAULT 'present' CHECK(local_state IN ('present', 'pending_download')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_vault_blobs_updated ON vault_blobs(updated_at)');
  db.exec("CREATE INDEX IF NOT EXISTS idx_vault_blobs_upload ON vault_blobs(upload_state)");

  // --- v65: manifest of Many JSONL sessions (conversations sync domain) ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS many_session_index (
      id TEXT PRIMARY KEY,
      title TEXT,
      agent_id TEXT,
      rel_path TEXT NOT NULL DEFAULT '',
      hash TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_many_session_index_updated ON many_session_index(updated_at)');

  createSyncTriggers(db);
}

/**
 * Domain Sync triggers (v65):
 *  - timestamp maintenance on tables that historically had no updated_at
 *    (tags, resource_tags) so incremental push can select their deltas;
 *  - AFTER DELETE tombstone recording for the content domains (library,
 *    agents, learn, conversations, files). Deleting a parent row records the
 *    cascade-deleted children automatically — no per-call-site bookkeeping.
 *    Remote tombstone application cleans its own echo (sync-tombstone.cjs).
 * Idempotent (IF NOT EXISTS); ms epoch via julianday.
 */
function createSyncTriggers(db) {
  const NOW_MS = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
  const hasColumn = (table, column) => {
    try {
      return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
    } catch {
      return false;
    }
  };

  // Timestamp triggers need the v65 columns; on an upgrading DB they appear
  // after migration 65 (which re-invokes createSyncTriggers).
  if (hasColumn('resource_tags', 'updated_at')) {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_resource_tags_stamp AFTER INSERT ON resource_tags
      WHEN new.created_at = 0 OR new.updated_at = 0 BEGIN
        UPDATE resource_tags
        SET created_at = CASE WHEN new.created_at = 0 THEN ${NOW_MS} ELSE new.created_at END,
            updated_at = CASE WHEN new.updated_at = 0 THEN ${NOW_MS} ELSE new.updated_at END
        WHERE resource_id = new.resource_id AND tag_id = new.tag_id;
      END
    `);
  }

  if (hasColumn('tags', 'updated_at')) {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_tags_stamp_insert AFTER INSERT ON tags
      WHEN new.updated_at = 0 BEGIN
        UPDATE tags SET updated_at = COALESCE(NULLIF(new.created_at, 0), ${NOW_MS}) WHERE id = new.id;
      END
    `);

    // recursive_triggers is OFF by default in SQLite, so this self-update does not re-fire.
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_tags_stamp_update AFTER UPDATE OF name, color ON tags BEGIN
        UPDATE tags SET updated_at = ${NOW_MS} WHERE id = new.id;
      END
    `);
  }

  const tombstoneTables = [
    // library
    'projects',
    'resources',
    'sources',
    'tags',
    'artifacts',
    'resource_interactions',
    // agents
    'agent_folders',
    'workflow_folders',
    'many_agents',
    'many_agent_versions',
    'canvas_workflows',
    'automation_definitions',
    // learn
    'flashcard_decks',
    'flashcards',
    'flashcard_sessions',
    'study_events',
    'studio_outputs',
    'quiz_runs',
    // conversations + files
    'chat_sessions',
    'chat_messages',
    'many_session_index',
    'vault_blobs',
  ];
  for (const table of tombstoneTables) {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_ts_${table}_ad AFTER DELETE ON ${table} BEGIN
        INSERT INTO sync_tombstones (table_name, row_id, deleted_at, synced)
        VALUES ('${table}', old.id, ${NOW_MS}, 0)
        ON CONFLICT(table_name, row_id) DO UPDATE SET
          deleted_at = excluded.deleted_at,
          synced = 0;
      END
    `);
  }

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_ts_resource_tags_ad AFTER DELETE ON resource_tags BEGIN
      INSERT INTO sync_tombstones (table_name, row_id, deleted_at, synced)
      VALUES ('resource_tags', old.resource_id || ':' || old.tag_id, ${NOW_MS}, 0)
      ON CONFLICT(table_name, row_id) DO UPDATE SET
        deleted_at = excluded.deleted_at,
        synced = 0;
    END
  `);
}

module.exports = { createBaseSchema, createSyncTriggers };
