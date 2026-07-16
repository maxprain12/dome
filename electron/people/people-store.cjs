'use strict';

/**
 * Unified people / identities store (plan 003).
 * Cross-source contacts: github login, email, social handles, manual.
 */

const database = require('../core/database.cjs');
const { secureTimestampId } = require('../core/secure-id.cjs');

const SOURCES = new Set([
  'github',
  'email',
  'social_x',
  'social_linkedin',
  'social_instagram',
  'manual',
]);

const db = () => database.getDB();
const now = () => Date.now();

function normalizeProjectId(projectId) {
  return typeof projectId === 'string' && projectId.trim() ? projectId.trim() : 'default';
}

function normalizeExternalId(source, externalId) {
  const raw = String(externalId || '').trim();
  if (!raw) return '';
  if (source === 'email') return raw.toLowerCase();
  if (source === 'github' || source.startsWith('social_')) return raw.replace(/^@/, '').toLowerCase();
  return raw;
}

function parseMeta(metaJson) {
  if (!metaJson) return null;
  try {
    return JSON.parse(metaJson);
  } catch {
    return null;
  }
}

function mapIdentity(row) {
  return {
    id: row.id,
    personId: row.person_id,
    projectId: row.project_id,
    source: row.source,
    externalId: row.external_id,
    displayLabel: row.display_label ?? null,
    meta: parseMeta(row.meta_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPerson(row, identities = []) {
  return {
    id: row.id,
    projectId: row.project_id,
    displayName: row.display_name,
    primaryEmail: row.primary_email ?? null,
    avatarUrl: row.avatar_url ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    identities: identities.map(mapIdentity),
  };
}

function loadIdentities(personId) {
  return db()
    .prepare(
      `SELECT * FROM person_identities WHERE person_id = ? ORDER BY source, external_id`,
    )
    .all(personId);
}

function getPerson(id) {
  if (typeof id !== 'string' || !id) return null;
  const row = db().prepare('SELECT * FROM people WHERE id = ?').get(id);
  if (!row) return null;
  return mapPerson(row, loadIdentities(id));
}

function listPeople(projectId, { limit = 200 } = {}) {
  const pid = normalizeProjectId(projectId);
  const cap = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const rows = db()
    .prepare(
      `SELECT * FROM people WHERE project_id = ? ORDER BY display_name COLLATE NOCASE ASC LIMIT ?`,
    )
    .all(pid, cap);
  return rows.map((row) => mapPerson(row, loadIdentities(row.id)));
}

/**
 * Upsert a person by id (update) or create new.
 * Does not auto-merge ambiguous names.
 */
function upsertPerson({
  id,
  projectId,
  displayName,
  primaryEmail,
  avatarUrl,
  notes,
} = {}) {
  const pid = normalizeProjectId(projectId);
  const name = String(displayName || '').trim();
  if (!name) throw new Error('displayName required');
  const ts = now();
  const personId = typeof id === 'string' && id ? id : secureTimestampId('person');

  const existing = db().prepare('SELECT id FROM people WHERE id = ?').get(personId);
  if (existing) {
    db()
      .prepare(
        `UPDATE people SET
          display_name = @display_name,
          primary_email = COALESCE(@primary_email, primary_email),
          avatar_url = COALESCE(@avatar_url, avatar_url),
          notes = COALESCE(@notes, notes),
          updated_at = @ts
         WHERE id = @id AND project_id = @project_id`,
      )
      .run({
        id: personId,
        project_id: pid,
        display_name: name,
        primary_email: primaryEmail ?? null,
        avatar_url: avatarUrl ?? null,
        notes: notes ?? null,
        ts,
      });
  } else {
    db()
      .prepare(
        `INSERT INTO people
          (id, project_id, display_name, primary_email, avatar_url, notes, created_at, updated_at)
         VALUES (@id, @project_id, @display_name, @primary_email, @avatar_url, @notes, @ts, @ts)`,
      )
      .run({
        id: personId,
        project_id: pid,
        display_name: name,
        primary_email: primaryEmail ?? null,
        avatar_url: avatarUrl ?? null,
        notes: notes ?? null,
        ts,
      });
  }
  return getPerson(personId);
}

/**
 * Link an identity to a person. If (project, source, external_id) exists on
 * another person, returns that existing person (no silent merge).
 */
function linkIdentity({
  personId,
  projectId,
  source,
  externalId,
  displayLabel,
  meta,
} = {}) {
  if (!SOURCES.has(source)) throw new Error(`Invalid source: ${source}`);
  const ext = normalizeExternalId(source, externalId);
  if (!ext) throw new Error('externalId required');
  if (typeof personId !== 'string' || !personId) throw new Error('personId required');

  const person = db().prepare('SELECT * FROM people WHERE id = ?').get(personId);
  if (!person) throw new Error('Person not found');
  const pid = normalizeProjectId(projectId ?? person.project_id);
  if (person.project_id !== pid) throw new Error('project_id mismatch');

  const existing = db()
    .prepare(
      `SELECT * FROM person_identities
       WHERE project_id = ? AND source = ? AND external_id = ?`,
    )
    .get(pid, source, ext);

  const ts = now();
  const metaJson = meta != null ? JSON.stringify(meta) : null;

  if (existing) {
    if (existing.person_id !== personId) {
      return {
        linked: false,
        conflict: true,
        person: getPerson(existing.person_id),
        identity: mapIdentity(existing),
      };
    }
    db()
      .prepare(
        `UPDATE person_identities SET
          display_label = COALESCE(@display_label, display_label),
          meta_json = COALESCE(@meta_json, meta_json),
          updated_at = @ts
         WHERE id = @id`,
      )
      .run({
        id: existing.id,
        display_label: displayLabel ?? null,
        meta_json: metaJson,
        ts,
      });
    return { linked: true, conflict: false, person: getPerson(personId) };
  }

  const id = secureTimestampId('pident');
  db()
    .prepare(
      `INSERT INTO person_identities
        (id, person_id, project_id, source, external_id, display_label, meta_json, created_at, updated_at)
       VALUES (@id, @person_id, @project_id, @source, @external_id, @display_label, @meta_json, @ts, @ts)`,
    )
    .run({
      id,
      person_id: personId,
      project_id: pid,
      source,
      external_id: ext,
      display_label: displayLabel ?? null,
      meta_json: metaJson,
      ts,
    });

  if (source === 'email' && !person.primary_email) {
    db()
      .prepare(`UPDATE people SET primary_email = ?, updated_at = ? WHERE id = ?`)
      .run(ext, ts, personId);
  }

  return { linked: true, conflict: false, person: getPerson(personId) };
}

function indexPersonInSearch(person) {
  if (!person?.id) return;
  try {
    const sourceIndex = require('../search/source-index.cjs');
    const handles = (person.identities || [])
      .map((i) => `${i.source}:${i.externalId}`)
      .join(' ');
    sourceIndex.upsertDocument({
      kind: 'person',
      sourceId: person.id,
      projectId: person.projectId,
      title: person.displayName,
      body: [person.primaryEmail, handles].filter(Boolean).join('\n'),
      meta: { identities: person.identities },
    });
  } catch {
    /* index optional until migration 68 */
  }
}

/**
 * Find or create a person for a github/email/social identity.
 * Never merges two different people with the same display name.
 */
function upsertIdentityPerson({
  projectId,
  source,
  externalId,
  displayName,
  displayLabel,
  avatarUrl,
  primaryEmail,
  meta,
} = {}) {
  if (!SOURCES.has(source)) throw new Error(`Invalid source: ${source}`);
  const pid = normalizeProjectId(projectId);
  const ext = normalizeExternalId(source, externalId);
  if (!ext) throw new Error('externalId required');

  const existingIdent = db()
    .prepare(
      `SELECT * FROM person_identities
       WHERE project_id = ? AND source = ? AND external_id = ?`,
    )
    .get(pid, source, ext);

  if (existingIdent) {
    const person = getPerson(existingIdent.person_id);
    if (avatarUrl || displayName) {
      upsertPerson({
        id: person.id,
        projectId: pid,
        displayName: displayName || person.displayName,
        avatarUrl: avatarUrl ?? undefined,
        primaryEmail: primaryEmail ?? undefined,
      });
    }
    linkIdentity({
      personId: existingIdent.person_id,
      projectId: pid,
      source,
      externalId: ext,
      displayLabel,
      meta,
    });
    const updated = getPerson(existingIdent.person_id);
    indexPersonInSearch(updated);
    return updated;
  }

  const name =
    String(displayName || displayLabel || externalId || '')
      .trim()
      .replace(/^@/, '') || ext;
  const person = upsertPerson({
    projectId: pid,
    displayName: name,
    primaryEmail: primaryEmail ?? (source === 'email' ? ext : null),
    avatarUrl,
  });
  linkIdentity({
    personId: person.id,
    projectId: pid,
    source,
    externalId: ext,
    displayLabel: displayLabel ?? name,
    meta,
  });
  const result = getPerson(person.id);
  indexPersonInSearch(result);
  return result;
}

function searchPeople(projectId, query, { limit = 20 } = {}) {
  const pid = normalizeProjectId(projectId);
  const q = String(query || '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
  if (!q) return [];
  const cap = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const like = `%${q.replace(/[%_]/g, '')}%`;

  const rows = db()
    .prepare(
      `SELECT DISTINCT p.*
       FROM people p
       LEFT JOIN person_identities i ON i.person_id = p.id
       WHERE p.project_id = ?
         AND (
           LOWER(p.display_name) LIKE ?
           OR LOWER(IFNULL(p.primary_email, '')) LIKE ?
           OR LOWER(i.external_id) LIKE ?
           OR LOWER(IFNULL(i.display_label, '')) LIKE ?
         )
       ORDER BY
         CASE WHEN LOWER(p.display_name) = ? THEN 0
              WHEN LOWER(i.external_id) = ? THEN 1
              ELSE 2 END,
         p.display_name COLLATE NOCASE
       LIMIT ?`,
    )
    .all(pid, like, like, like, like, q, q, cap);

  return rows.map((row) => mapPerson(row, loadIdentities(row.id)));
}

/**
 * Seed / refresh github identities from local issue assignees + repo owners.
 */
function syncGithubIdentitiesFromStore(projectId) {
  const pid = normalizeProjectId(projectId);
  const store = require('../github/github-store.cjs');
  const repos = (store.listRepos(pid) || []).filter((r) => r.selected);

  let upserted = 0;
  for (const repo of repos) {
    const owner = repo.owner;
    if (owner) {
      upsertIdentityPerson({
        projectId: pid,
        source: 'github',
        externalId: owner,
        displayName: owner,
        displayLabel: owner,
        meta: { from: 'repo_owner', repoId: repo.id },
      });
      upserted += 1;
    }
  }

  const issueRows = db()
    .prepare(
      `SELECT i.assignees_json
       FROM github_issues i
       JOIN github_repos r ON r.id = i.repo_id
       WHERE r.project_id = ? AND r.selected = 1`,
    )
    .all(pid);

  const seen = new Set();
  for (const row of issueRows) {
    let assignees = [];
    try {
      assignees = JSON.parse(row.assignees_json || '[]');
    } catch {
      assignees = [];
    }
    if (!Array.isArray(assignees)) continue;
    for (const login of assignees) {
      const key = String(login || '')
        .replace(/^@/, '')
        .toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      upsertIdentityPerson({
        projectId: pid,
        source: 'github',
        externalId: key,
        displayName: key,
        displayLabel: key,
        meta: { from: 'issue_assignee' },
      });
      upserted += 1;
    }
  }

  return { upserted, projectId: pid };
}

module.exports = {
  SOURCES,
  getPerson,
  listPeople,
  upsertPerson,
  linkIdentity,
  upsertIdentityPerson,
  searchPeople,
  syncGithubIdentitiesFromStore,
  normalizeExternalId,
  normalizeProjectId,
};
