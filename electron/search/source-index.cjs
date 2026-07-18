'use strict';

/**
 * Cross-domain FTS index for integrations (plan 005).
 * kinds: issue | email | person | social_post
 * Lance remains resources-only; this is SQLite FTS5 fan-in for unified search.
 */

const database = require('../core/database.cjs');

const KINDS = new Set(['issue', 'email', 'person', 'social_post']);
const DOMAIN_CAP = 12;

const db = () => database.getDB();
const now = () => Date.now();

function docId(kind, sourceId) {
  return `${kind}:${sourceId}`;
}

function upsertDocument({ kind, sourceId, projectId, title, body, meta }) {
  if (!KINDS.has(kind)) throw new Error(`Invalid kind: ${kind}`);
  if (!sourceId) throw new Error('sourceId required');
  const id = docId(kind, sourceId);
  const pid = typeof projectId === 'string' && projectId.trim() ? projectId.trim() : 'default';
  const ts = now();
  const titleText = String(title || '').slice(0, 2000);
  const bodyText = String(body || '').slice(0, 50_000);
  const metaJson = meta != null ? JSON.stringify(meta) : null;

  db()
    .prepare(
      `INSERT INTO source_documents
        (id, kind, source_id, project_id, title, body, meta_json, updated_at)
       VALUES (@id, @kind, @source_id, @project_id, @title, @body, @meta_json, @ts)
       ON CONFLICT(id) DO UPDATE SET
         project_id = excluded.project_id,
         title = excluded.title,
         body = excluded.body,
         meta_json = excluded.meta_json,
         updated_at = excluded.updated_at`,
    )
    .run({
      id,
      kind,
      source_id: String(sourceId),
      project_id: pid,
      title: titleText,
      body: bodyText,
      meta_json: metaJson,
      ts,
    });

  // External-content FTS: delete + insert (triggers may also exist).
  db().prepare('DELETE FROM source_documents_fts WHERE doc_id = ?').run(id);
  db()
    .prepare(
      `INSERT INTO source_documents_fts(doc_id, title, body) VALUES (?, ?, ?)`,
    )
    .run(id, titleText, bodyText);

  return id;
}

function removeDocument(kind, sourceId) {
  const id = docId(kind, sourceId);
  db().prepare('DELETE FROM source_documents_fts WHERE doc_id = ?').run(id);
  db().prepare('DELETE FROM source_documents WHERE id = ?').run(id);
}

function removeByKindPrefix(kind, projectId = null) {
  if (projectId) {
    const rows = db()
      .prepare('SELECT id FROM source_documents WHERE kind = ? AND project_id = ?')
      .all(kind, projectId);
    for (const row of rows) {
      db().prepare('DELETE FROM source_documents_fts WHERE doc_id = ?').run(row.id);
    }
    db()
      .prepare('DELETE FROM source_documents WHERE kind = ? AND project_id = ?')
      .run(kind, projectId);
    return;
  }
  const rows = db().prepare('SELECT id FROM source_documents WHERE kind = ?').all(kind);
  for (const row of rows) {
    db().prepare('DELETE FROM source_documents_fts WHERE doc_id = ?').run(row.id);
  }
  db().prepare('DELETE FROM source_documents WHERE kind = ?').run(kind);
}

function mapDocRow(row, limit, counts, out) {
  const n = counts[row.kind] || 0;
  if (n >= limit) return;
  counts[row.kind] = n + 1;
  let meta = null;
  try {
    meta = row.meta_json ? JSON.parse(row.meta_json) : null;
  } catch {
    meta = null;
  }
  out.push({
    kind: row.kind,
    id: row.source_id,
    docId: row.id,
    projectId: row.project_id,
    title: row.title,
    snippet: row.body_snippet || row.title_snippet || (row.body || '').slice(0, 120),
    meta,
  });
}

function searchDocumentsFts(sanitizedFtsQuery, limit, projectId) {
  if (projectId) {
    return db()
      .prepare(
        `SELECT d.id, d.kind, d.source_id, d.project_id, d.title, d.body, d.meta_json,
                snippet(source_documents_fts, 1, '', '', '…', 12) AS title_snippet,
                snippet(source_documents_fts, 2, '', '', '…', 24) AS body_snippet
         FROM source_documents_fts fts
         JOIN source_documents d ON d.id = fts.doc_id
         WHERE source_documents_fts MATCH ?
           AND d.project_id = ?
         ORDER BY rank
         LIMIT ?`,
      )
      .all(sanitizedFtsQuery, projectId, limit * KINDS.size);
  }
  return db()
    .prepare(
      `SELECT d.id, d.kind, d.source_id, d.project_id, d.title, d.body, d.meta_json,
              snippet(source_documents_fts, 1, '', '', '…', 12) AS title_snippet,
              snippet(source_documents_fts, 2, '', '', '…', 24) AS body_snippet
       FROM source_documents_fts fts
       JOIN source_documents d ON d.id = fts.doc_id
       WHERE source_documents_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
    )
    .all(sanitizedFtsQuery, limit * KINDS.size);
}

/** Substring fallback when FTS returns nothing (empty index, odd tokenization). */
function searchDocumentsLike(rawTerms, limit, projectId) {
  if (!Array.isArray(rawTerms) || rawTerms.length === 0) return [];
  const termClauses = rawTerms.map(() => '(LOWER(d.title) LIKE ? OR LOWER(d.body) LIKE ?)').join(' AND ');
  const params = rawTerms.flatMap((t) => {
    const pat = `%${String(t).toLowerCase().replace(/[%_]/g, '')}%`;
    return [pat, pat];
  });
  let sql = `SELECT d.id, d.kind, d.source_id, d.project_id, d.title, d.body, d.meta_json,
                    NULL AS title_snippet, SUBSTR(d.body, 1, 120) AS body_snippet
             FROM source_documents d
             WHERE ${termClauses}`;
  if (projectId) {
    sql += ' AND d.project_id = ?';
    params.push(projectId);
  }
  sql += ' ORDER BY d.updated_at DESC LIMIT ?';
  params.push(limit * KINDS.size);
  return db().prepare(sql).all(...params);
}

/**
 * @param {string} sanitizedFtsQuery — already quoted FTS terms
 * @param {{ projectId?: string, limitPerKind?: number, rawTerms?: string[] }} [opts]
 */
function searchDocuments(sanitizedFtsQuery, opts = {}) {
  if (!sanitizedFtsQuery && !(opts.rawTerms && opts.rawTerms.length)) return [];
  const limit = Math.min(Math.max(Number(opts.limitPerKind) || DOMAIN_CAP, 1), 20);
  const projectId = opts.projectId;

  let rows = sanitizedFtsQuery ? searchDocumentsFts(sanitizedFtsQuery, limit, projectId) : [];
  if (rows.length === 0 && Array.isArray(opts.rawTerms) && opts.rawTerms.length > 0) {
    rows = searchDocumentsLike(opts.rawTerms, limit, projectId);
  }

  const counts = Object.create(null);
  const out = [];
  for (const row of rows) {
    mapDocRow(row, limit, counts, out);
  }
  return out;
}

function countDocuments(kind, projectId = null) {
  if (projectId) {
    return (
      db()
        .prepare('SELECT COUNT(*) AS n FROM source_documents WHERE kind = ? AND project_id = ?')
        .get(kind, projectId)?.n || 0
    );
  }
  return db().prepare('SELECT COUNT(*) AS n FROM source_documents WHERE kind = ?').get(kind)?.n || 0;
}

function selectedRepos(projectId = null) {
  const store = require('../github/github-store.cjs');
  if (projectId) {
    return store.listRepos(projectId).filter((r) => Number(r.selected) === 1);
  }
  return store.listSelectedRepos();
}

function countGithubIssuesForProject(projectId = null) {
  const store = require('../github/github-store.cjs');
  let n = 0;
  for (const repo of selectedRepos(projectId)) {
    n += store.countIssues(repo.id);
  }
  return n;
}

/**
 * Index a single github_issues row into source_documents (Cmd+K).
 * Safe to call after create/update/sync.
 */
function indexGithubIssue(issue, repo) {
  if (!issue || !repo || Number(issue.is_pull_request) === 1) return null;
  const pid = repo.project_id || 'default';
  return upsertDocument({
    kind: 'issue',
    sourceId: issue.id,
    projectId: pid,
    title: `#${issue.number} ${issue.title || ''}`.trim(),
    body: String(issue.body || '').slice(0, 20_000),
    meta: {
      number: issue.number,
      state: issue.state,
      repoId: repo.id,
      fullName: repo.full_name,
    },
  });
}

function indexGithubIssueById(issueId) {
  const store = require('../github/github-store.cjs');
  const issue = store.getIssue(issueId);
  if (!issue) return null;
  const repo = store.getRepo(issue.repo_id);
  if (!repo) return null;
  return indexGithubIssue(issue, repo);
}

function indexGithubIssues(projectId = null) {
  const store = require('../github/github-store.cjs');
  const repos = projectId ? store.listRepos(projectId) : store.listSelectedRepos();
  let n = 0;
  for (const repo of repos) {
    if (projectId && Number(repo.selected) !== 1) continue;
    const issues = store.listIssues(repo.id);
    for (const issue of issues) {
      indexGithubIssue(issue, repo);
      n += 1;
    }
  }
  return n;
}

/**
 * Lazy warm the issue FTS index when github_issues has rows but source_documents
 * is empty/behind (common when Seguimiento shows tasks but ⌘K never synced index).
 */
function ensureGithubIssuesIndexed(projectId = null) {
  try {
    const available = countGithubIssuesForProject(projectId);
    if (available === 0) return 0;
    const indexed = countDocuments('issue', projectId);
    if (indexed === 0 || available > indexed) {
      return indexGithubIssues(projectId);
    }
  } catch (err) {
    console.warn('[source-index] ensureGithubIssuesIndexed:', err?.message || err);
  }
  return 0;
}

/**
 * Direct SQL over github_issues when the FTS layer still misses (empty index race).
 * @param {string[]} rawTerms
 * @param {string|null} projectId
 * @param {number} [limit]
 */
function searchGithubIssuesDirect(rawTerms, projectId = null, limit = DOMAIN_CAP) {
  if (!Array.isArray(rawTerms) || rawTerms.length === 0) return [];
  const cap = Math.min(Math.max(Number(limit) || DOMAIN_CAP, 1), 20);
  const termClauses = rawTerms
    .map(() => '(LOWER(i.title) LIKE ? OR LOWER(COALESCE(i.body, \'\')) LIKE ? OR CAST(i.number AS TEXT) = ?)')
    .join(' AND ');
  const params = rawTerms.flatMap((t) => {
    const raw = String(t).toLowerCase().replace(/[%_]/g, '');
    const pat = `%${raw}%`;
    return [pat, pat, raw.replace(/^#/, '')];
  });

  let sql = `SELECT i.id AS source_id, i.number, i.title, i.body, i.state, i.repo_id,
                    r.full_name, r.project_id
             FROM github_issues i
             JOIN github_repos r ON r.id = i.repo_id
             WHERE i.is_pull_request = 0
               AND r.selected = 1
               AND ${termClauses}`;
  if (projectId) {
    sql += ' AND r.project_id = ?';
    params.push(projectId);
  }
  sql += ' ORDER BY i.number DESC LIMIT ?';
  params.push(cap);

  try {
    const rows = db().prepare(sql).all(...params);
    return rows.map((row) => ({
      kind: 'issue',
      id: row.source_id,
      docId: docId('issue', row.source_id),
      projectId: row.project_id || 'default',
      title: `#${row.number} ${row.title || ''}`.trim(),
      snippet: String(row.body || '').slice(0, 120),
      meta: {
        number: row.number,
        state: row.state,
        repoId: row.repo_id,
        fullName: row.full_name,
      },
    }));
  } catch (err) {
    console.warn('[source-index] searchGithubIssuesDirect:', err?.message || err);
    return [];
  }
}

function indexPeople(projectId = null) {
  const peopleStore = require('../people/people-store.cjs');
  const people = peopleStore.listPeople(projectId || 'default', { limit: 500 });
  // Also index other projects when global: scan distinct project_ids
  let list = people;
  if (!projectId) {
    const pids = db()
      .prepare('SELECT DISTINCT project_id FROM people')
      .all()
      .map((r) => r.project_id);
    list = [];
    for (const pid of pids) {
      list.push(...peopleStore.listPeople(pid, { limit: 500 }));
    }
  }
  let n = 0;
  for (const person of list) {
    const handles = (person.identities || [])
      .map((i) => `${i.source}:${i.externalId}`)
      .join(' ');
    upsertDocument({
      kind: 'person',
      sourceId: person.id,
      projectId: person.projectId,
      title: person.displayName,
      body: [person.primaryEmail, handles, person.notes].filter(Boolean).join('\n'),
      meta: {
        identities: (person.identities || []).map((i) => ({
          source: i.source,
          externalId: i.externalId,
        })),
      },
    });
    n += 1;
  }
  return n;
}

function canIndexEmailBodies(accountId) {
  try {
    const row = db()
      .prepare('SELECT agent_actions FROM email_accounts WHERE id = ?')
      .get(accountId);
    if (!row?.agent_actions) return false;
    const actions = JSON.parse(row.agent_actions);
    return actions.search === true && actions.read === true;
  } catch {
    return false;
  }
}

function indexEmailMessages(accountId = null) {
  let rows;
  if (accountId) {
    rows = db()
      .prepare(
        `SELECT m.*, f.remote_name, a.project_id AS account_project_id
         FROM email_messages m
         JOIN email_folders f ON f.id = m.folder_id
         JOIN email_accounts a ON a.id = m.account_id
         WHERE m.account_id = ?`,
      )
      .all(accountId);
  } else {
    rows = db()
      .prepare(
        `SELECT m.*, f.remote_name, a.project_id AS account_project_id
         FROM email_messages m
         JOIN email_folders f ON f.id = m.folder_id
         JOIN email_accounts a ON a.id = m.account_id`,
      )
      .all();
  }

  let n = 0;
  for (const row of rows) {
    const allowBody = canIndexEmailBodies(row.account_id);
    const fromSnippet = String(row.from_json || '').slice(0, 200);
    const bodyParts = [fromSnippet, row.snippet || ''];
    if (allowBody && row.body_text) {
      bodyParts.push(String(row.body_text).slice(0, 10_000));
    }
    upsertDocument({
      kind: 'email',
      sourceId: row.id,
      projectId: row.account_project_id || 'default',
      title: row.subject || '(no subject)',
      body: bodyParts.join('\n'),
      meta: {
        accountId: row.account_id,
        folder: row.remote_name,
        uid: row.uid,
        hasBodyIndexed: allowBody && Boolean(row.body_text),
      },
    });
    n += 1;
  }
  return n;
}

const SOCIAL_PROVIDER_LABEL = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  x: 'X',
  twitter: 'X',
};

/** Short pin/search title — never the post body (body stays in `body` / snippet). */
function socialPostIndexTitle(row) {
  const key = String(row.provider || '').toLowerCase();
  const provider = SOCIAL_PROVIDER_LABEL[key] || row.provider || 'Social';
  const campaign = String(row.campaign || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 28);
  if (campaign) return `${provider} · ${campaign}`;
  const status = String(row.status || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);
  if (status) return `${provider} · ${status}`;
  return `${provider} · post`;
}

function indexSocialPosts() {
  let rows = [];
  try {
    // social_posts / social_accounts have no project_id — vault-global.
    rows = db()
      .prepare(
        `SELECT p.*
         FROM social_posts p
         ORDER BY p.updated_at DESC
         LIMIT 2000`,
      )
      .all();
  } catch {
    return 0;
  }
  let n = 0;
  for (const row of rows) {
    upsertDocument({
      kind: 'social_post',
      sourceId: row.id,
      projectId: 'default',
      title: socialPostIndexTitle(row),
      body: [row.body, row.topics, row.link_url].filter(Boolean).join('\n'),
      meta: {
        provider: row.provider,
        status: row.status,
        accountId: row.account_id,
        campaign: row.campaign || null,
      },
    });
    n += 1;
  }
  return n;
}

function countPeopleForProject(projectId = null) {
  if (projectId) {
    return (
      db().prepare('SELECT COUNT(*) AS n FROM people WHERE project_id = ?').get(projectId)?.n || 0
    );
  }
  return db().prepare('SELECT COUNT(*) AS n FROM people').get()?.n || 0;
}

function countEmailsForProject(projectId = null) {
  try {
    if (projectId) {
      return (
        db()
          .prepare(
            `SELECT COUNT(*) AS n FROM email_messages m
             JOIN email_accounts a ON a.id = m.account_id
             WHERE a.project_id = ?`,
          )
          .get(projectId)?.n || 0
      );
    }
    return db().prepare('SELECT COUNT(*) AS n FROM email_messages').get()?.n || 0;
  } catch {
    return 0;
  }
}

function countSocialForProject(_projectId = null) {
  // Social is vault-global (no project_id on posts/accounts).
  try {
    return db().prepare('SELECT COUNT(*) AS n FROM social_posts').get()?.n || 0;
  } catch {
    return 0;
  }
}

function ensurePeopleIndexed(projectId = null) {
  try {
    const available = countPeopleForProject(projectId);
    if (available === 0) return 0;
    const indexed = countDocuments('person', projectId);
    if (indexed === 0 || available > indexed) return indexPeople(projectId);
  } catch (err) {
    console.warn('[source-index] ensurePeopleIndexed:', err?.message || err);
  }
  return 0;
}

function ensureEmailIndexed(projectId = null) {
  try {
    const available = countEmailsForProject(projectId);
    if (available === 0) return 0;
    const indexed = countDocuments('email', projectId);
    if (indexed === 0 || available > indexed) {
      // indexEmailMessages() covers all accounts; project scoping is in the rows' project_id.
      return indexEmailMessages();
    }
  } catch (err) {
    console.warn('[source-index] ensureEmailIndexed:', err?.message || err);
  }
  return 0;
}

function ensureSocialIndexed(_projectId = null) {
  try {
    const available = countSocialForProject();
    if (available === 0) return 0;
    // Indexed under project_id 'default' (social has no vault scope).
    const indexed = countDocuments('social_post', 'default');
    if (indexed === 0 || available > indexed) return indexSocialPosts();
  } catch (err) {
    console.warn('[source-index] ensureSocialIndexed:', err?.message || err);
  }
  return 0;
}

/** Warm every integration FTS bucket used by ⌘K / @ mentions. */
function ensureAllSourcesIndexed(projectId = null) {
  return {
    issue: ensureGithubIssuesIndexed(projectId),
    person: ensurePeopleIndexed(projectId),
    email: ensureEmailIndexed(projectId),
    social_post: ensureSocialIndexed(projectId),
  };
}

function searchPeopleDirect(rawTerms, projectId = null, limit = DOMAIN_CAP) {
  if (!Array.isArray(rawTerms) || rawTerms.length === 0) return [];
  const peopleStore = require('../people/people-store.cjs');
  const q = rawTerms.join(' ').trim();
  if (!q) return [];
  try {
    const people = peopleStore.searchPeople(projectId || 'default', q, { limit });
    return people.map((person) => ({
      kind: 'person',
      id: person.id,
      docId: docId('person', person.id),
      projectId: person.projectId || projectId || 'default',
      title: person.displayName,
      snippet: person.primaryEmail || '',
      meta: {
        identities: (person.identities || []).map((i) => ({
          source: i.source,
          externalId: i.externalId,
        })),
      },
    }));
  } catch (err) {
    console.warn('[source-index] searchPeopleDirect:', err?.message || err);
    return [];
  }
}

function searchEmailDirect(rawTerms, projectId = null, limit = DOMAIN_CAP) {
  if (!Array.isArray(rawTerms) || rawTerms.length === 0) return [];
  const cap = Math.min(Math.max(Number(limit) || DOMAIN_CAP, 1), 20);
  const termClauses = rawTerms
    .map(
      () =>
        `(LOWER(COALESCE(m.subject, '')) LIKE ? OR LOWER(COALESCE(m.snippet, '')) LIKE ? OR LOWER(COALESCE(m.from_json, '')) LIKE ?)`,
    )
    .join(' AND ');
  const params = rawTerms.flatMap((t) => {
    const pat = `%${String(t).toLowerCase().replace(/[%_]/g, '')}%`;
    return [pat, pat, pat];
  });
  let sql = `SELECT m.id AS source_id, m.subject, m.snippet, m.from_json, m.uid, m.account_id,
                    f.remote_name AS folder, a.project_id AS project_id
             FROM email_messages m
             JOIN email_folders f ON f.id = m.folder_id
             JOIN email_accounts a ON a.id = m.account_id
             WHERE ${termClauses}`;
  if (projectId) {
    sql += ' AND a.project_id = ?';
    params.push(projectId);
  }
  sql += ' ORDER BY m.date_ms DESC LIMIT ?';
  params.push(cap);
  try {
    return db()
      .prepare(sql)
      .all(...params)
      .map((row) => ({
        kind: 'email',
        id: row.source_id,
        docId: docId('email', row.source_id),
        projectId: row.project_id || 'default',
        title: row.subject || '(no subject)',
        snippet: String(row.snippet || row.from_json || '').slice(0, 120),
        meta: {
          accountId: row.account_id,
          folder: row.folder,
          uid: row.uid,
        },
      }));
  } catch (err) {
    console.warn('[source-index] searchEmailDirect:', err?.message || err);
    return [];
  }
}

function searchSocialDirect(rawTerms, _projectId = null, limit = DOMAIN_CAP) {
  if (!Array.isArray(rawTerms) || rawTerms.length === 0) return [];
  const cap = Math.min(Math.max(Number(limit) || DOMAIN_CAP, 1), 20);
  const termClauses = rawTerms
    .map(
      () =>
        `(LOWER(COALESCE(p.body, '')) LIKE ? OR LOWER(COALESCE(p.topics, '')) LIKE ? OR LOWER(COALESCE(p.link_url, '')) LIKE ?)`,
    )
    .join(' AND ');
  const params = rawTerms.flatMap((t) => {
    const pat = `%${String(t).toLowerCase().replace(/[%_]/g, '')}%`;
    return [pat, pat, pat];
  });
  // No project filter — social_posts/accounts have no project_id.
  const sql = `SELECT p.id AS source_id, p.body, p.topics, p.provider, p.status, p.account_id, p.campaign
             FROM social_posts p
             WHERE ${termClauses}
             ORDER BY p.updated_at DESC LIMIT ?`;
  params.push(cap);
  try {
    return db()
      .prepare(sql)
      .all(...params)
      .map((row) => ({
        kind: 'social_post',
        id: row.source_id,
        docId: docId('social_post', row.source_id),
        projectId: 'default',
        title: socialPostIndexTitle(row),
        snippet: String(row.body || row.topics || '').replace(/\s+/g, ' ').trim().slice(0, 120),
        meta: {
          provider: row.provider,
          status: row.status,
          accountId: row.account_id,
          campaign: row.campaign || null,
        },
      }));
  } catch (err) {
    console.warn('[source-index] searchSocialDirect:', err?.message || err);
    return [];
  }
}

/**
 * Fill missing kinds after FTS/LIKE by querying domain tables directly.
 * @param {Array<{kind: string}>} sources
 * @param {string[]} rawTerms
 * @param {string|null} projectId
 */
function enrichSourcesWithDirectFallback(sources, rawTerms, projectId = null) {
  if (!Array.isArray(rawTerms) || rawTerms.length === 0) return sources || [];
  const out = Array.isArray(sources) ? sources.slice() : [];
  const has = (kind) => out.some((s) => s.kind === kind);
  if (!has('issue')) out.push(...searchGithubIssuesDirect(rawTerms, projectId));
  if (!has('person')) out.push(...searchPeopleDirect(rawTerms, projectId));
  if (!has('email')) out.push(...searchEmailDirect(rawTerms, projectId));
  if (!has('social_post')) out.push(...searchSocialDirect(rawTerms, projectId));
  return out;
}

function listRecentSources(projectId = null, limitPerKind = 5) {
  ensureAllSourcesIndexed(projectId);
  const limit = Math.min(Math.max(Number(limitPerKind) || 5, 1), 12);
  const out = [];
  for (const kind of ['person', 'issue', 'email', 'social_post']) {
    let rows;
    try {
      if (projectId) {
        rows = db()
          .prepare(
            `SELECT id, kind, source_id, project_id, title, body, meta_json
             FROM source_documents
             WHERE kind = ? AND project_id = ?
             ORDER BY updated_at DESC
             LIMIT ?`,
          )
          .all(kind, projectId, limit);
      } else {
        rows = db()
          .prepare(
            `SELECT id, kind, source_id, project_id, title, body, meta_json
             FROM source_documents
             WHERE kind = ?
             ORDER BY updated_at DESC
             LIMIT ?`,
          )
          .all(kind, limit);
      }
    } catch {
      rows = [];
    }
    for (const row of rows) {
      let meta = null;
      try {
        meta = row.meta_json ? JSON.parse(row.meta_json) : null;
      } catch {
        meta = null;
      }
      out.push({
        kind: row.kind,
        id: row.source_id,
        docId: row.id,
        projectId: row.project_id,
        title: row.title,
        snippet: String(row.body || '').slice(0, 120),
        meta,
      });
    }
  }
  return out;
}

/** Full rebuild in plan order: github → people → email → social. */
function rebuildAll(projectId = null) {
  if (projectId) {
    for (const kind of KINDS) removeByKindPrefix(kind, projectId);
  }
  const counts = {
    issue: indexGithubIssues(projectId),
    person: indexPeople(projectId),
    email: indexEmailMessages(),
    social_post: indexSocialPosts(),
  };
  return counts;
}

module.exports = {
  KINDS,
  DOMAIN_CAP,
  docId,
  upsertDocument,
  removeDocument,
  removeByKindPrefix,
  searchDocuments,
  indexGithubIssues,
  indexGithubIssue,
  indexGithubIssueById,
  ensureGithubIssuesIndexed,
  ensurePeopleIndexed,
  ensureEmailIndexed,
  ensureSocialIndexed,
  ensureAllSourcesIndexed,
  searchGithubIssuesDirect,
  searchPeopleDirect,
  searchEmailDirect,
  searchSocialDirect,
  enrichSourcesWithDirectFallback,
  listRecentSources,
  indexPeople,
  indexEmailMessages,
  indexSocialPosts,
  rebuildAll,
  canIndexEmailBodies,
};
