/**
 * 0012_github — github_repos, github_milestones, github_issues, github_branches,
 * github_releases, github_sync_state, github_calendar_links
 */
module.exports = {
  id: '0012_github',
  up: async (db) => {
    await db.exec(`
      CREATE TABLE github_repos (
        id TEXT PRIMARY KEY,
        remote_id BIGINT NOT NULL,
        owner TEXT NOT NULL,
        name TEXT NOT NULL,
        full_name TEXT NOT NULL,
        private BIGINT DEFAULT 0,
        html_url TEXT,
        selected BIGINT DEFAULT 0,
        last_sync_at BIGINT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        UNIQUE(full_name)
      );

      CREATE INDEX idx_github_repos_selected ON github_repos(selected);

      CREATE TABLE github_milestones (
        id TEXT PRIMARY KEY,
        repo_id TEXT NOT NULL,
        number BIGINT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        due_on BIGINT,
        state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open', 'closed')),
        open_issues BIGINT DEFAULT 0,
        closed_issues BIGINT DEFAULT 0,
        html_url TEXT,
        remote_updated_at BIGINT,
        dome_updated_at BIGINT,
        dirty BIGINT DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        closed_at BIGINT,
        UNIQUE(repo_id, number)
      );

      CREATE INDEX idx_github_milestones_dirty ON github_milestones(dirty);
      CREATE INDEX idx_github_milestones_repo ON github_milestones(repo_id);

      CREATE TABLE github_issues (
        id TEXT PRIMARY KEY,
        repo_id TEXT NOT NULL,
        number BIGINT NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open', 'closed')),
        milestone_number BIGINT,
        due_date BIGINT,
        labels TEXT,
        assignees TEXT,
        is_pull_request BIGINT DEFAULT 0,
        html_url TEXT,
        remote_updated_at BIGINT,
        dome_updated_at BIGINT,
        dirty BIGINT DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        UNIQUE(repo_id, number)
      );

      CREATE INDEX idx_github_issues_dirty ON github_issues(dirty);
      CREATE INDEX idx_github_issues_milestone ON github_issues(repo_id, milestone_number);
      CREATE INDEX idx_github_issues_repo ON github_issues(repo_id);

      CREATE TABLE github_branches (
        id TEXT PRIMARY KEY,
        repo_id TEXT NOT NULL,
        name TEXT NOT NULL,
        sha TEXT,
        protected BIGINT DEFAULT 0,
        linked_issue_number BIGINT,
        updated_at BIGINT NOT NULL,
        UNIQUE(repo_id, name)
      );

      CREATE INDEX idx_github_branches_repo ON github_branches(repo_id);

      CREATE TABLE github_releases (
        id TEXT PRIMARY KEY,
        repo_id TEXT NOT NULL,
        remote_id BIGINT NOT NULL,
        tag_name TEXT NOT NULL,
        name TEXT,
        published_at BIGINT,
        html_url TEXT,
        updated_at BIGINT NOT NULL,
        body TEXT,
        UNIQUE(repo_id, remote_id)
      );

      CREATE INDEX idx_github_releases_repo ON github_releases(repo_id);

      CREATE TABLE github_sync_state (
        id TEXT PRIMARY KEY,
        repo_id TEXT NOT NULL,
        resource TEXT NOT NULL,
        etag TEXT,
        last_synced_at BIGINT,
        UNIQUE(repo_id, resource)
      );

      CREATE TABLE github_calendar_links (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('milestone', 'issue', 'release')),
        entity_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        UNIQUE(entity_type, entity_id)
      );

      CREATE INDEX idx_github_calendar_links_event ON github_calendar_links(event_id);
    `);
  },
};
