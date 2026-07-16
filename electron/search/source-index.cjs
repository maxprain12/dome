'use strict';

/**
 * Cross-domain FTS index for integrations (plan 005).
 * kinds: issue | email | person | social_post
 * Lance remains resources-only; this is SQLite FTS5 fan-in for unified search.
 */

const database = require('../core/database.cjs');

const KINDS = new Set(['issue', 'email', 'person', 'social_post']);
const DOMAIN_CAP = 5;

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

/**
 * @param {string} sanitizedFtsQuery — already quoted FTS terms
 * @param {{ projectId?: string, limitPerKind?: number }} [opts]
 */
function searchDocuments(sanitizedFtsQuery, opts = {}) {
  if (!sanitizedFtsQuery) return [];
  const limit = Math.min(Math.max(Number(opts.limitPerKind) || DOMAIN_CAP, 1), 20);
  const projectId = opts.projectId;

  let rows;
  if (projectId) {
    rows = db()
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
  } else {
    rows = db()
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

  // Cap per kind
  const counts = Object.create(null);
  const out = [];
  for (const row of rows) {
    const n = counts[row.kind] || 0;
    if (n >= limit) continue;
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
  return out;
}

function indexGithubIssues(projectId = null) {
  const store = require('../github/github-store.cjs');
  const repos = projectId ? store.listRepos(projectId) : store.listSelectedRepos();
  let n = 0;
  for (const repo of repos) {
    if (!repo.selected && projectId) continue;
    const pid = repo.project_id || projectId || 'default';
    const issues = store.listIssues(repo.id);
    for (const issue of issues) {
      upsertDocument({
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
      n += 1;
    }
  }
  return n;
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

function indexSocialPosts() {
  let rows = [];
  try {
    rows = db()
      .prepare(
        `SELECT p.*, a.project_id AS account_project_id
         FROM social_posts p
         LEFT JOIN social_accounts a ON a.id = p.account_id
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
      projectId: row.account_project_id || row.project_id || 'default',
      title: String(row.body || '').slice(0, 80) || `Post ${row.id}`,
      body: [row.body, row.topics, row.link_url].filter(Boolean).join('\n'),
      meta: {
        provider: row.provider,
        status: row.status,
        accountId: row.account_id,
      },
    });
    n += 1;
  }
  return n;
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
  indexPeople,
  indexEmailMessages,
  indexSocialPosts,
  rebuildAll,
  canIndexEmailBodies,
};
