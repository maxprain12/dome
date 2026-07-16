/* eslint-disable no-console */
/**
 * SQLite migrations — squashed baseline at schema v65 (2026-07-10).
 *
 * The old frozen history (migrations 1–49) was squashed into the base schema
 * (db/schema.cjs now reflects the FULL v65 schema and fresh installs jump
 * straight to schema_version=65). Kept verbatim: the recent chain 50→64
 * (it contains real data transforms — github id rewrites, vault_path
 * backfills, calendar timestamp fixes — that a column-level reconciliation
 * could not reproduce) plus the v65 bridge (drops dead tables, moves the
 * sync device_id into settings).
 *
 * Compatibility floor: schema_version >= 50. Anything older must export
 * its data from a previous Dome build (or reinstall); applyMigrations aborts
 * with a clear error instead of guessing.
 *
 * Add a new migration by defining a `migrationN` function that bumps
 * `schema_version` and calling it from applyMigrations (after migration65).
 */

const crypto = require('crypto');

// Electron's package throws on require when its binary isn't installed
// (some tooling runs without it); migrations only use app paths at runtime.
let app = null;
try {
  ({ app } = require('electron'));
} catch {
  /* outside Electron */
}

const SCHEMA_HEAD = 68;
const MIN_SUPPORTED_VERSION = 50;

function setSchemaVersion(db, value) {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ('schema_version', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(String(value), Date.now());
}

function tableExists(db, name) {
  try {
    return Boolean(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name),
    );
  } catch {
    return false;
  }
}

function migration51(db, version) {
  if (version < 51) {
    console.log('[DB] Running migration 51 - github_releases.body');
    try {
      const cols = db.prepare('PRAGMA table_info(github_releases)').all();
      if (!cols.some((c) => c.name === 'body')) {
        db.exec('ALTER TABLE github_releases ADD COLUMN body TEXT');
      }
      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '51', ?)
        ON CONFLICT(key) DO UPDATE SET value = '51', updated_at = excluded.updated_at
      `).run(Date.now());
      console.log('[DB] Migration 51 complete - github_releases.body added');
    } catch (error) {
      console.error('[DB] Migration 51 failed:', error);
      throw error;
    }
  }
}

// Migration 50: snap GitHub all-day events to local midnight.
// Earlier versions of the GitHub→calendar bridge stored `start_at` and
// `end_at` from the raw GitHub timestamps (e.g. `published_at: 18:30 UTC`),
// so the all-day event was painted as a 24-hour bar that started mid-day and
// the month-view renderer (which collapses only `end == startOfNextDay` back
// to a single cell) ended up showing the same release across two days. Fixing
// the bridge alone is not enough for events already in the database — this
// migration retroactively snaps every `source = 'github'`, `all_day = 1`
// event to local midnight and resets `end_at = start_at + 24h`.
function migration50(db, version) {
  if (version < 50) {
    console.log('[DB] Running migration 50 - snap GitHub all-day events to midnight');
    try {
      const updateOne = db.prepare(
        'UPDATE calendar_events SET start_at = ?, end_at = ? WHERE id = ?',
      );
      const rows = db.prepare(
        "SELECT id, start_at, end_at FROM calendar_events WHERE all_day = 1 AND (metadata LIKE '%\"source\":\"github\"%' OR metadata LIKE '%\"source\": \"github\"%')",
      ).all();
      let fixed = 0;
      const tx = db.transaction((items) => {
        for (const r of items) {
          const start = new Date(r.start_at);
          // Skip if already at local midnight (idempotent guard).
          if (start.getHours() === 0 && start.getMinutes() === 0 && start.getSeconds() === 0 && start.getMilliseconds() === 0) continue;
          start.setHours(0, 0, 0, 0);
          const newStart = start.getTime();
          const newEnd = newStart + 24 * 60 * 60 * 1000;
          updateOne.run(newStart, newEnd, r.id);
          fixed += 1;
        }
      });
      tx(rows);
      console.log(`[DB] Migration 50 - snapped ${fixed} GitHub all-day events to midnight`);

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '50', ?)
        ON CONFLICT(key) DO UPDATE SET value = '50', updated_at = excluded.updated_at
      `).run(Date.now());
      console.log('[DB] Migration 50 complete - GitHub all-day events snapped');
    } catch (error) {
      console.error('[DB] Migration 50 failed:', error);
      throw error;
    }
  }
}

// Migration 52: Pipelines — unified Kanban model on top of the existing run
// engine. Adds four tables (pipelines, pipeline_stages, pipeline_items,
// pipeline_sources). Purely additive: no DROP/ALTER on existing tables, so it
// is reversible by restoring the pre-migration backup. Items reference the
// existing automation_runs / calendar_events / many_agents / canvas_workflows
// rows rather than duplicating them.
function migration52(db, version) {
  if (version < 52) {
    console.log('[DB] Running migration 52 - pipelines');
    try {
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
      db.exec('CREATE INDEX IF NOT EXISTS idx_pipelines_project ON pipelines(project_id, updated_at)');

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
      db.exec('CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline ON pipeline_stages(pipeline_id, position)');

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
      db.exec('CREATE INDEX IF NOT EXISTS idx_pipeline_sources_pipeline ON pipeline_sources(pipeline_id)');

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
      db.exec('CREATE INDEX IF NOT EXISTS idx_pipeline_items_stage ON pipeline_items(stage_id, position)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_pipeline_items_pipeline ON pipeline_items(pipeline_id, updated_at)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_pipeline_items_run ON pipeline_items(current_run_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_pipeline_items_range ON pipeline_items(start_at, end_at)');

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '52', ?)
        ON CONFLICT(key) DO UPDATE SET value = '52', updated_at = excluded.updated_at
      `).run(Date.now());
      console.log('[DB] Migration 52 complete - pipelines tables created');
    } catch (error) {
      console.error('[DB] Migration 52 failed:', error);
      throw error;
    }
  }
}

function migration53(db, version) {
  if (version < 53) {
    try {
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
      db.exec('CREATE INDEX IF NOT EXISTS idx_pipeline_item_events_item ON pipeline_item_events(item_id, created_at)');

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '53', ?)
        ON CONFLICT(key) DO UPDATE SET value = '53', updated_at = excluded.updated_at
      `).run(Date.now());
      console.log('[DB] Migration 53 complete - pipeline_item_events table created');
    } catch (error) {
      console.error('[DB] Migration 53 failed:', error);
      throw error;
    }
  }
}

function migration54(db, version) {
  if (version < 54) {
    console.log('[DB] Running migration 54 - email account action permissions');
    try {
      const tableInfo = db.prepare('PRAGMA table_info(email_accounts)').all();
      const cols = new Set(tableInfo.map((c) => c.name));
      const defaultUser = '{"list":true,"read":true,"search":true,"send":true,"reply":true}';
      const defaultAgent = '{"list":true,"read":true,"search":true,"send":false,"reply":false}';
      if (!cols.has('user_actions')) {
        db.exec(`ALTER TABLE email_accounts ADD COLUMN user_actions TEXT NOT NULL DEFAULT '${defaultUser}'`);
      }
      if (!cols.has('agent_actions')) {
        db.exec(`ALTER TABLE email_accounts ADD COLUMN agent_actions TEXT NOT NULL DEFAULT '${defaultAgent}'`);
      }
      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '54', ?)
        ON CONFLICT(key) DO UPDATE SET value = '54', updated_at = excluded.updated_at
      `).run(Date.now());
      console.log('[DB] Migration 54 complete - email account permissions columns');
    } catch (error) {
      console.error('[DB] Migration 54 failed:', error);
      throw error;
    }
  }
}

function migration55(db, version) {
  if (version < 55) {
    console.log('[DB] Running migration 55 - folder vault_path backfill (vault = source of truth)');
    try {
      const userData = app ? app.getPath('userData') : null;
      if (userData) {
        const vs = require('../../storage/vault-store.cjs');
        const folders = db
          .prepare("SELECT id, project_id, folder_id, title FROM resources WHERE type = 'folder' AND (vault_path IS NULL OR trim(vault_path) = '') ORDER BY created_at ASC")
          .all();
        const fsMod = require('fs');
        const pathMod = require('path');
        const defaultVault = pathMod.join(userData, 'dome-files', 'vault');
        const projRoot = (projectId) => {
          const p = db.prepare('SELECT name, vault_root FROM projects WHERE id = ?').get(projectId);
          const custom = p && typeof p.vault_root === 'string' ? p.vault_root.trim() : '';
          if (custom) return custom;
          return pathMod.join(defaultVault, vs.sanitizeSegment((p && p.name) || 'Library', 'Library'));
        };
        const folderDirFromTitles = (folderId) => {
          const segs = [];
          const seen = new Set();
          let fid = folderId;
          while (fid && !seen.has(fid)) {
            seen.add(fid);
            const f = db.prepare('SELECT title, folder_id, type FROM resources WHERE id = ?').get(fid);
            if (!f || f.type !== 'folder') break;
            segs.unshift(vs.sanitizeSegment(f.title, 'Folder'));
            fid = f.folder_id || null;
          }
          return segs.join('/');
        };
        const setVaultPath = db.prepare('UPDATE resources SET vault_path = ? WHERE id = ?');
        let updated = 0;
        for (const f of folders) {
          try {
            const dir = folderDirFromTitles(f.folder_id);
            const seg = vs.sanitizeSegment(f.title, 'Folder');
            let rel = dir ? `${dir}/${seg}` : seg;
            const owner = db.prepare("SELECT id FROM resources WHERE project_id = ? AND vault_path = ? AND type = 'folder' AND id != ?").get(f.project_id, rel, f.id);
            if (owner) {
              const shortId = String(f.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-6) || 'dup';
              rel = dir ? `${dir}/${seg} (${shortId})` : `${seg} (${shortId})`;
            }
            const abs = pathMod.join(projRoot(f.project_id), rel);
            if (!fsMod.existsSync(abs)) fsMod.mkdirSync(abs, { recursive: true });
            setVaultPath.run(rel, f.id);
            updated += 1;
          } catch (e) {
            console.warn('[DB] Migration 55 folder backfill skip:', f.id, e.message);
          }
        }
        console.log(`[DB] Migration 55 backfilled ${updated} folder vault_path(s)`);
      }
      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '55', ?)
        ON CONFLICT(key) DO UPDATE SET value = '55', updated_at = excluded.updated_at
      `).run(Date.now());
      console.log('[DB] Migration 55 complete - folder vault_path backfill');
    } catch (error) {
      console.error('[DB] Migration 55 failed:', error);
      throw error;
    }
  }
}

function migration56(db, version) {
  if (version < 56) {
    console.log('[DB] Running migration 56 - scope calendar/email accounts to vault (project_id)');
    try {
      const calCols = new Set(db.prepare('PRAGMA table_info(calendar_accounts)').all().map((c) => c.name));
      if (!calCols.has('project_id')) {
        db.exec("ALTER TABLE calendar_accounts ADD COLUMN project_id TEXT NOT NULL DEFAULT 'default'");
        db.exec('CREATE INDEX IF NOT EXISTS idx_calendar_accounts_project ON calendar_accounts(project_id)');
      }
      const emailCols = new Set(db.prepare('PRAGMA table_info(email_accounts)').all().map((c) => c.name));
      if (!emailCols.has('project_id')) {
        db.exec("ALTER TABLE email_accounts ADD COLUMN project_id TEXT NOT NULL DEFAULT 'default'");
        db.exec('CREATE INDEX IF NOT EXISTS idx_email_accounts_project ON email_accounts(project_id)');
      }
      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '56', ?)
        ON CONFLICT(key) DO UPDATE SET value = '56', updated_at = excluded.updated_at
      `).run(Date.now());
      console.log('[DB] Migration 56 complete - calendar/email project_id columns');
    } catch (error) {
      console.error('[DB] Migration 56 failed:', error);
      throw error;
    }
  }
}

function migration57(db, version) {
  if (version < 57) {
    console.log('[DB] Running migration 57 - scope GitHub repos to vault (project_id)');
    try {
      const ghRepoCols = new Set(db.prepare('PRAGMA table_info(github_repos)').all().map((c) => c.name));
      if (!ghRepoCols.has('project_id')) {
        db.exec("ALTER TABLE github_repos ADD COLUMN project_id TEXT NOT NULL DEFAULT 'default'");
      }

      const projectSlug = (projectId) =>
        crypto.createHash('sha1').update(String(projectId)).digest('hex').slice(0, 12);
      const newRepoId = (remoteId, projectId) => `ghr-${remoteId}-${projectSlug(projectId)}`;
      const linkId = (entityType, entityId) =>
        `ghcl-${entityType}-${crypto.createHash('sha1').update(String(entityId)).digest('hex').slice(0, 12)}`;

      const rewireCalendarLink = (entityType, oldEid, newEid) => {
        const link = db
          .prepare('SELECT 1 FROM github_calendar_links WHERE entity_type = ? AND entity_id = ?')
          .get(entityType, oldEid);
        if (!link) return;
        db.prepare(
          'UPDATE github_calendar_links SET id = ?, entity_id = ? WHERE entity_type = ? AND entity_id = ?',
        ).run(linkId(entityType, newEid), newEid, entityType, oldEid);
      };

      const rewireMilestones = (oldId, newId) => {
        const rows = db.prepare('SELECT id, number FROM github_milestones WHERE repo_id = ?').all(oldId);
        for (const m of rows) {
          const newMid = `ghm-${newId}-${m.number}`;
          rewireCalendarLink('milestone', m.id, newMid);
          rewireCalendarLink('milestone', `${m.id}:completed`, `${newMid}:completed`);
          db.prepare('UPDATE github_milestones SET id = ?, repo_id = ? WHERE id = ?').run(newMid, newId, m.id);
        }
      };

      const rewireIssues = (oldId, newId) => {
        const rows = db.prepare('SELECT id, number FROM github_issues WHERE repo_id = ?').all(oldId);
        for (const issue of rows) {
          const newIid = `ghi-${newId}-${issue.number}`;
          rewireCalendarLink('issue', issue.id, newIid);
          db.prepare('UPDATE github_issues SET id = ?, repo_id = ? WHERE id = ?').run(newIid, newId, issue.id);
        }
      };

      const rewireBranches = (oldId, newId) => {
        const rows = db.prepare('SELECT id, name FROM github_branches WHERE repo_id = ?').all(oldId);
        for (const branch of rows) {
          const newBid = `ghb-${newId}-${projectSlug(branch.name)}`;
          db.prepare('UPDATE github_branches SET id = ?, repo_id = ? WHERE id = ?').run(newBid, newId, branch.id);
        }
      };

      const rewireReleases = (oldId, newId) => {
        const rows = db.prepare('SELECT id, remote_id FROM github_releases WHERE repo_id = ?').all(oldId);
        for (const rel of rows) {
          const newRid = `ghrel-${newId}-${rel.remote_id}`;
          rewireCalendarLink('release', rel.id, newRid);
          db.prepare('UPDATE github_releases SET id = ?, repo_id = ? WHERE id = ?').run(newRid, newId, rel.id);
        }
      };

      const rewireSyncState = (oldId, newId) => {
        const rows = db.prepare('SELECT id, resource FROM github_sync_state WHERE repo_id = ?').all(oldId);
        for (const st of rows) {
          const newSid = `ghs-${newId}-${st.resource}`;
          db.prepare('UPDATE github_sync_state SET id = ?, repo_id = ? WHERE id = ?').run(newSid, newId, st.id);
        }
      };

      const rewireRepo = (repo) => {
        const projectId = repo.project_id || 'default';
        const newId = newRepoId(repo.remote_id, projectId);
        if (repo.id === newId) return;
        const oldId = repo.id;

        // Parent id first; child rows still reference oldId until updated below.
        db.prepare('UPDATE github_repos SET id = ? WHERE id = ?').run(newId, oldId);
        rewireMilestones(oldId, newId);
        rewireIssues(oldId, newId);
        rewireBranches(oldId, newId);
        rewireReleases(oldId, newId);
        rewireSyncState(oldId, newId);
      };

      const rewireGithubRepoIds = () => {
        const repos = db.prepare('SELECT * FROM github_repos').all();
        if (repos.length === 0) return;

        const needsRewire = repos.some((repo) => {
          const projectId = repo.project_id || 'default';
          return repo.id !== newRepoId(repo.remote_id, projectId);
        });
        if (!needsRewire) {
          console.log('[DB] Migration 57 - GitHub repo ids already vault-scoped, skipping rewire');
          return;
        }

        // PRAGMA foreign_keys must run outside a transaction (no-op inside tx).
        db.pragma('foreign_keys = OFF');
        try {
          for (const repo of repos) {
            rewireRepo(repo);
          }
        } finally {
          db.pragma('foreign_keys = ON');
        }
      };

      rewireGithubRepoIds();

      // Rebuild github_repos so UNIQUE(full_name, project_id) replaces UNIQUE(full_name).
      const repoSchema =
        db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'github_repos'").get()?.sql || '';
      const hasCompositeUnique = repoSchema.includes('UNIQUE(full_name, project_id)');
      if (!hasCompositeUnique) {
        db.pragma('foreign_keys = OFF');
        try {
          db.exec(`
            CREATE TABLE github_repos_v57 (
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
            INSERT INTO github_repos_v57
              (id, remote_id, owner, name, full_name, private, html_url, selected, last_sync_at, project_id, created_at, updated_at)
            SELECT id, remote_id, owner, name, full_name, private, html_url, selected, last_sync_at, project_id, created_at, updated_at
            FROM github_repos
          `);
          db.exec('DROP TABLE github_repos');
          db.exec('ALTER TABLE github_repos_v57 RENAME TO github_repos');
        } finally {
          db.pragma('foreign_keys = ON');
        }
      }
      db.exec('CREATE INDEX IF NOT EXISTS idx_github_repos_selected ON github_repos(selected)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_github_repos_project ON github_repos(project_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_github_repos_project_selected ON github_repos(project_id, selected)');

      // Legacy global GitHub calendar → default vault calendar.
      const legacyCal = db.prepare('SELECT id FROM calendar_calendars WHERE id = ?').get('github-dome');
      if (legacyCal) {
        db.pragma('foreign_keys = OFF');
        try {
          const targetExists = db.prepare("SELECT id FROM calendar_calendars WHERE id = 'github-default'").get();
          if (targetExists) {
            db.prepare("UPDATE calendar_events SET calendar_id = 'github-default' WHERE calendar_id = 'github-dome'").run();
            db.prepare('DELETE FROM calendar_calendars WHERE id = ?').run('github-dome');
          } else {
            // github-dome already uses (account_id='local', remote_id='github') — rename, don't INSERT duplicate.
            db.prepare("UPDATE calendar_calendars SET id = 'github-default' WHERE id = 'github-dome'").run();
            db.prepare("UPDATE calendar_events SET calendar_id = 'github-default' WHERE calendar_id = 'github-dome'").run();
          }
        } finally {
          db.pragma('foreign_keys = ON');
        }
      }

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '57', ?)
        ON CONFLICT(key) DO UPDATE SET value = '57', updated_at = excluded.updated_at
      `).run(Date.now());
      console.log('[DB] Migration 57 complete - GitHub repos project_id + multi-vault ids');
    } catch (error) {
      console.error('[DB] Migration 57 failed:', error);
      throw error;
    }
  }
}

function migration58(db, version) {
  if (version < 58) {
    console.log('[DB] Running migration 58 - artifact vault HTML mirror backfill');
    try {
      const userData = app ? app.getPath('userData') : null;
      if (userData) {
        const fileStorage = require('../../storage/file-storage.cjs');
        const databaseMod = require('../../core/database.cjs');
        const vs = require('../../storage/vault-store.cjs');
        const updated = vs.backfillArtifactVaultMirrors({ database: databaseMod, fileStorage });
        console.log(`[DB] Migration 58 backfilled ${updated} artifact vault mirror(s)`);
      }
      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '58', ?)
        ON CONFLICT(key) DO UPDATE SET value = '58', updated_at = excluded.updated_at
      `).run(Date.now());
      console.log('[DB] Migration 58 complete - artifact vault mirror backfill');
    } catch (error) {
      console.error('[DB] Migration 58 failed:', error);
      throw error;
    }
  }
}

function migration59(db, version) {
  if (version < 59) {
    console.log('[DB] Running migration 59 - social hub (accounts, posts, metrics)');
    try {
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
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_social_accounts_provider ON social_accounts(provider)');

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
          scheduled_at INTEGER,
          published_at INTEGER,
          external_post_id TEXT,
          external_url TEXT,
          error TEXT,
          created_by TEXT NOT NULL DEFAULT 'user',
          group_id TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (account_id) REFERENCES social_accounts(id) ON DELETE SET NULL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts(status, scheduled_at)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_social_posts_provider ON social_posts(provider, published_at)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_social_posts_group ON social_posts(group_id)');

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
          raw TEXT,
          FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_social_metrics_post ON social_metrics(post_id, captured_at)');

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '59', ?)
        ON CONFLICT(key) DO UPDATE SET value = '59', updated_at = excluded.updated_at
      `).run(Date.now());
      console.log('[DB] Migration 59 complete - social hub tables');
    } catch (error) {
      console.error('[DB] Migration 59 failed:', error);
      throw error;
    }
  }
}

function migration60(db, version) {
  if (version < 60) {
    console.log('[DB] Running migration 60 - social account metrics + AI reports');
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS social_account_metrics (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          captured_at INTEGER NOT NULL,
          followers INTEGER,
          following INTEGER,
          posts_count INTEGER,
          raw TEXT,
          FOREIGN KEY (account_id) REFERENCES social_accounts(id) ON DELETE CASCADE
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_social_account_metrics ON social_account_metrics(account_id, captured_at)');

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
      db.exec('CREATE INDEX IF NOT EXISTS idx_social_reports_created ON social_reports(created_at)');

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '60', ?)
        ON CONFLICT(key) DO UPDATE SET value = '60', updated_at = excluded.updated_at
      `).run(Date.now());
      console.log('[DB] Migration 60 complete - social account metrics + reports');
    } catch (error) {
      console.error('[DB] Migration 60 failed:', error);
      throw error;
    }
  }
}

function migration61(db, version) {
  if (version < 61) {
    console.log('[DB] Running migration 61 - social account kind (member vs organization pages)');
    try {
      const cols = db.prepare("PRAGMA table_info('social_accounts')").all().map((c) => c.name);
      if (!cols.includes('account_kind')) {
        db.exec("ALTER TABLE social_accounts ADD COLUMN account_kind TEXT NOT NULL DEFAULT 'member'");
      }

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '61', ?)
        ON CONFLICT(key) DO UPDATE SET value = '61', updated_at = excluded.updated_at
      `).run(Date.now());
      console.log('[DB] Migration 61 complete - social account kind');
    } catch (error) {
      console.error('[DB] Migration 61 failed:', error);
      throw error;
    }
  }

  if (version < 62) {
    console.log('[DB] Running migration 62 - domain sync (tombstones + domain_sync_state + social cloud columns)');
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_tombstones (
          table_name TEXT NOT NULL,
          row_id TEXT NOT NULL,
          deleted_at INTEGER NOT NULL,
          synced INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (table_name, row_id)
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_sync_tombstones_pending ON sync_tombstones(synced) WHERE synced = 0');

      db.exec(`
        CREATE TABLE IF NOT EXISTS domain_sync_state (
          domain TEXT PRIMARY KEY,
          last_pull_cursor TEXT NOT NULL DEFAULT '0',
          last_push_at INTEGER NOT NULL DEFAULT 0,
          enabled INTEGER NOT NULL DEFAULT 1,
          updated_at INTEGER NOT NULL
        )
      `);

      const accountCols = db.prepare("PRAGMA table_info('social_accounts')").all().map((c) => c.name);
      if (!accountCols.includes('cloud_publishing')) {
        db.exec('ALTER TABLE social_accounts ADD COLUMN cloud_publishing INTEGER NOT NULL DEFAULT 0');
      }

      const postCols = db.prepare("PRAGMA table_info('social_posts')").all().map((c) => c.name);
      if (!postCols.includes('media_storage')) {
        db.exec("ALTER TABLE social_posts ADD COLUMN media_storage TEXT NOT NULL DEFAULT '[]'");
      }

      const metricsCols = db.prepare("PRAGMA table_info('social_metrics')").all().map((c) => c.name);
      if (!metricsCols.includes('updated_at')) {
        db.exec('ALTER TABLE social_metrics ADD COLUMN updated_at INTEGER');
        db.exec('UPDATE social_metrics SET updated_at = captured_at WHERE updated_at IS NULL');
      }

      const accountMetricsCols = db
        .prepare("PRAGMA table_info('social_account_metrics')")
        .all()
        .map((c) => c.name);
      if (!accountMetricsCols.includes('updated_at')) {
        db.exec('ALTER TABLE social_account_metrics ADD COLUMN updated_at INTEGER');
        db.exec('UPDATE social_account_metrics SET updated_at = captured_at WHERE updated_at IS NULL');
      }

      const now = Date.now();
      for (const domain of ['social', 'pipelines', 'calendar']) {
        db.prepare(
          `
            INSERT INTO domain_sync_state (domain, last_pull_cursor, last_push_at, enabled, updated_at)
            VALUES (?, '0', 0, 1, ?)
            ON CONFLICT(domain) DO NOTHING
          `,
        ).run(domain, now);
      }

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '62', ?)
        ON CONFLICT(key) DO UPDATE SET value = '62', updated_at = excluded.updated_at
      `).run(now);
      console.log('[DB] Migration 62 complete - domain sync');
    } catch (error) {
      console.error('[DB] Migration 62 failed:', error);
      throw error;
    }
  }

  if (version < 63) {
    console.log('[DB] Running migration 63 - backfill social metrics updated_at');
    try {
      db.exec(`
        UPDATE social_metrics
        SET updated_at = captured_at
        WHERE updated_at IS NULL OR updated_at = 0
      `);
      db.exec(`
        UPDATE social_account_metrics
        SET updated_at = captured_at
        WHERE updated_at IS NULL OR updated_at = 0
      `);
      const now = Date.now();
      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '63', ?)
        ON CONFLICT(key) DO UPDATE SET value = '63', updated_at = excluded.updated_at
      `).run(now);
      console.log('[DB] Migration 63 complete - social metrics updated_at');
    } catch (error) {
      console.error('[DB] Migration 63 failed:', error);
      throw error;
    }
  }

  if (version < 64) {
    console.log('[DB] Running migration 64 - settings domain sync (synced_settings)');
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS synced_settings (
          id TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          device_id TEXT,
          deleted_at INTEGER
        )
      `);

      const now = Date.now();
      db.prepare(
        `
          INSERT INTO domain_sync_state (domain, last_pull_cursor, last_push_at, enabled, updated_at)
          VALUES ('settings', '0', 0, 1, ?)
          ON CONFLICT(domain) DO NOTHING
        `,
      ).run(now);

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '64', ?)
        ON CONFLICT(key) DO UPDATE SET value = '64', updated_at = excluded.updated_at
      `).run(now);
      console.log('[DB] Migration 64 complete - settings domain sync');
    } catch (error) {
      console.error('[DB] Migration 64 failed:', error);
      throw error;
    }
  }
}

// Migration 65 — squash bridge: dead-table cleanup + device_id relocation +
// sync timestamp columns for tables that never had them (tags, resource_tags).
// The base schema (schema.cjs) already created any table added after the
// source version, so this only has to remove/alter what differs at v65.
function migration65(db, version) {
  if (version >= 65) return;
  console.log('[DB] Running migration 65 - squash bridge (dead tables + device_id)');

  // Sync timestamps for tags / resource_tags (needed for incremental push).
  try {
    const hasCol = (table, col) =>
      db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
    const now = Date.now();
    if (!hasCol('tags', 'updated_at')) {
      db.exec('ALTER TABLE tags ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0');
      db.prepare('UPDATE tags SET updated_at = created_at WHERE updated_at = 0').run();
    }
    if (!hasCol('resource_tags', 'created_at')) {
      db.exec('ALTER TABLE resource_tags ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0');
      db.exec('ALTER TABLE resource_tags ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0');
      db.prepare('UPDATE resource_tags SET created_at = ?, updated_at = ? WHERE updated_at = 0').run(now, now);
    }
    // Timestamp triggers were skipped by createBaseSchema while the columns
    // were missing — create them now that the columns exist.
    const { createSyncTriggers } = require('./schema.cjs');
    createSyncTriggers(db);
  } catch (err) {
    console.warn('[DB] Migration 65: sync timestamp columns skipped:', err?.message);
  }

  // Preserve the sync device_id before dropping its legacy home (bundle sync v3).
  try {
    if (tableExists(db, 'dome_cloud_sync')) {
      const row = db.prepare('SELECT device_id FROM dome_cloud_sync WHERE id = 1').get();
      if (row?.device_id) {
        db.prepare(
          `INSERT INTO settings (key, value, updated_at) VALUES ('device_id', ?, ?)
           ON CONFLICT(key) DO NOTHING`,
        ).run(row.device_id, Date.now());
      }
    }
  } catch (err) {
    console.warn('[DB] Migration 65: device_id copy skipped:', err?.message);
  }

  // Dead tables: unused features, bundle sync v3 and old rebuild scratch tables.
  const deadTables = [
    'martin_memory',
    'agent_store',
    'auth_profiles',
    'resource_links_legacy',
    'search_index',
    'note_embeddings',
    'resource_images',
    'dome_cloud_sync',
    'cloud_blob_state',
    'resources_new',
    'sources_new',
    'automation_definitions_new',
    'flashcard_decks_new',
    'quiz_runs_new',
    'studio_outputs_new',
    'github_repos_v57',
  ];
  for (const table of deadTables) {
    try {
      db.exec(`DROP TABLE IF EXISTS ${table}`);
    } catch (err) {
      console.warn(`[DB] Migration 65: could not drop ${table}:`, err?.message);
    }
  }

  setSchemaVersion(db, 65);
  console.log('[DB] Migration 65 complete - squash bridge');
}

function migration66(db, version) {
  if (version >= 66) return;
  console.log('[DB] Running migration 66 - people / person_identities');
  try {
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
    db.exec(`CREATE INDEX IF NOT EXISTS idx_people_project ON people(project_id, updated_at)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_people_display_name ON people(project_id, display_name)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_person_identities_person ON person_identities(person_id)`);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_person_identities_external ON person_identities(project_id, source, external_id)`,
    );
    setSchemaVersion(db, 66);
    console.log('[DB] Migration 66 complete - people');
  } catch (error) {
    console.error('[DB] Migration 66 failed:', error);
    throw error;
  }
}

function migration67(db, version) {
  if (version >= 67) return;
  console.log('[DB] Running migration 67 - email folders / messages / sync_state');
  try {
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
    db.exec(`CREATE INDEX IF NOT EXISTS idx_email_folders_account ON email_folders(account_id)`);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_email_messages_folder ON email_messages(folder_id, date_ms DESC)`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_email_messages_account ON email_messages(account_id, date_ms DESC)`,
    );
    setSchemaVersion(db, 67);
    console.log('[DB] Migration 67 complete - email persist');
  } catch (error) {
    console.error('[DB] Migration 67 failed:', error);
    throw error;
  }
}

function migration68(db, version) {
  if (version >= 68) return;
  console.log('[DB] Running migration 68 - source_documents FTS (integrations search)');
  try {
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
      CREATE INDEX IF NOT EXISTS idx_source_documents_kind_project
        ON source_documents(kind, project_id)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_source_documents_source
        ON source_documents(kind, source_id)
    `);
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS source_documents_fts USING fts5(
        doc_id UNINDEXED,
        title,
        body
      )
    `);
    setSchemaVersion(db, 68);
    console.log('[DB] Migration 68 complete - source_documents');
  } catch (error) {
    console.error('[DB] Migration 68 failed:', error);
    throw error;
  }
}

// Ordered migration steps. Order is execution order — do not sort by number
// (51 intentionally runs before 50, matching the original frozen history).
// migration61 also carries 62–64 internally (kept verbatim from the old file).
const MIGRATION_STEPS = [
  migration51,
  migration50,
  migration52,
  migration53,
  migration54,
  migration55,
  migration56,
  migration57,
  migration58,
  migration59,
  migration60,
  migration61,
];

function applyMigrations(db, version, invalidateQueries = () => {}) {
  if (version >= SCHEMA_HEAD) return;

  if (version === 0) {
    // Fresh database: createBaseSchema already produced the full head schema.
    // Guard against an ancient pre-versioning DB (it would carry user data).
    let projectCount = 0;
    try {
      projectCount = db.prepare('SELECT COUNT(*) AS c FROM projects').get()?.c ?? 0;
    } catch {
      projectCount = 0;
    }
    if (projectCount > 0) {
      throw new Error(
        'This Dome database predates schema versioning and cannot be upgraded by this build. ' +
          'Export your data with a previous Dome version (Settings → Sync → Export) and import it here.',
      );
    }
    setSchemaVersion(db, SCHEMA_HEAD);
    return;
  }

  if (version < MIN_SUPPORTED_VERSION) {
    throw new Error(
      `This Dome database is at schema v${version}, below the supported floor (v${MIN_SUPPORTED_VERSION}). ` +
        'Upgrade it with a previous Dome version first (any 2026 build up to the migration squash), ' +
        'or export/import your data.',
    );
  }

  for (const step of MIGRATION_STEPS) {
    step(db, version, invalidateQueries);
  }
  migration65(db, version);
  migration66(db, version);
  migration67(db, version);
  migration68(db, version);
}

module.exports = { applyMigrations, SCHEMA_HEAD, MIN_SUPPORTED_VERSION };
