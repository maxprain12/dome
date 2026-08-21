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

const LEAD_STATUSES = new Set(['lead', 'customer', 'archived']);

function parseJson(raw, fallback = null) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
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
    meta: parseJson(row.meta_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapInteraction(row) {
  return {
    id: row.id,
    personId: row.person_id,
    projectId: row.project_id,
    kind: row.kind,
    refType: row.ref_type ?? null,
    refId: row.ref_id ?? null,
    summary: row.summary ?? null,
    payload: parseJson(row.payload, {}),
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPerson(row, identities = [], interactions = null) {
  const person = {
    id: row.id,
    projectId: row.project_id,
    displayName: row.display_name,
    primaryEmail: row.primary_email ?? null,
    avatarUrl: row.avatar_url ?? null,
    notes: row.notes ?? null,
    leadStatus: row.lead_status || 'lead',
    profile: parseJson(row.profile_json, {}),
    discoveredVia: row.discovered_via ?? null,
    firstSeenAt: row.first_seen_at ?? null,
    lastSeenAt: row.last_seen_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    identities: identities.map(mapIdentity),
  };
  if (interactions) person.interactions = interactions.map(mapInteraction);
  return person;
}

function loadIdentities(personId) {
  return db()
    .prepare(
      `SELECT * FROM person_identities WHERE person_id = ? ORDER BY source, external_id`,
    )
    .all(personId);
}

function loadInteractions(personId, { limit = 100 } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 100, 1), 200);
  return db()
    .prepare(
      `SELECT * FROM person_interactions
       WHERE person_id = ?
       ORDER BY occurred_at DESC
       LIMIT ?`,
    )
    .all(personId, cap);
}

function getPerson(id, { includeInteractions = false } = {}) {
  if (typeof id !== 'string' || !id) return null;
  const row = db().prepare('SELECT * FROM people WHERE id = ?').get(id);
  if (!row) return null;
  return mapPerson(
    row,
    loadIdentities(id),
    includeInteractions ? loadInteractions(id) : null,
  );
}

function listPeople(projectId, { limit = 200, leadStatus } = {}) {
  const pid = normalizeProjectId(projectId);
  const cap = Math.min(Math.max(Number(limit) || 200, 1), 500);
  let rows;
  if (leadStatus && LEAD_STATUSES.has(leadStatus)) {
    rows = db()
      .prepare(
        `SELECT * FROM people
         WHERE project_id = ? AND lead_status = ?
         ORDER BY COALESCE(last_seen_at, updated_at) DESC, display_name COLLATE NOCASE ASC
         LIMIT ?`,
      )
      .all(pid, leadStatus, cap);
  } else {
    rows = db()
      .prepare(
        `SELECT * FROM people
         WHERE project_id = ?
         ORDER BY COALESCE(last_seen_at, updated_at) DESC, display_name COLLATE NOCASE ASC
         LIMIT ?`,
      )
      .all(pid, cap);
  }
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
  leadStatus,
  profile,
  discoveredVia,
  firstSeenAt,
  lastSeenAt,
} = {}) {
  const pid = normalizeProjectId(projectId);
  const name = String(displayName || '').trim();
  if (!name) throw new Error('displayName required');
  const ts = now();
  const personId = typeof id === 'string' && id ? id : secureTimestampId('person');
  const status =
    leadStatus && LEAD_STATUSES.has(leadStatus) ? leadStatus : 'lead';
  const profileJson =
    profile != null ? JSON.stringify(profile) : null;

  const existing = db().prepare('SELECT id FROM people WHERE id = ?').get(personId);
  if (existing) {
    db()
      .prepare(
        `UPDATE people SET
          display_name = @display_name,
          primary_email = COALESCE(@primary_email, primary_email),
          avatar_url = COALESCE(@avatar_url, avatar_url),
          notes = COALESCE(@notes, notes),
          lead_status = COALESCE(@lead_status, lead_status),
          profile_json = COALESCE(@profile_json, profile_json),
          discovered_via = COALESCE(@discovered_via, discovered_via),
          first_seen_at = COALESCE(@first_seen_at, first_seen_at),
          last_seen_at = COALESCE(@last_seen_at, last_seen_at),
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
        lead_status: leadStatus && LEAD_STATUSES.has(leadStatus) ? leadStatus : null,
        profile_json: profileJson,
        discovered_via: discoveredVia ?? null,
        first_seen_at: firstSeenAt ?? null,
        last_seen_at: lastSeenAt ?? ts,
        ts,
      });
  } else {
    db()
      .prepare(
        `INSERT INTO people
          (id, project_id, display_name, primary_email, avatar_url, notes,
           lead_status, profile_json, discovered_via, first_seen_at, last_seen_at,
           created_at, updated_at)
         VALUES (@id, @project_id, @display_name, @primary_email, @avatar_url, @notes,
           @lead_status, @profile_json, @discovered_via, @first_seen_at, @last_seen_at,
           @ts, @ts)`,
      )
      .run({
        id: personId,
        project_id: pid,
        display_name: name,
        primary_email: primaryEmail ?? null,
        avatar_url: avatarUrl ?? null,
        notes: notes ?? null,
        lead_status: status,
        profile_json: profileJson ?? '{}',
        discovered_via: discoveredVia ?? null,
        first_seen_at: firstSeenAt ?? ts,
        last_seen_at: lastSeenAt ?? ts,
        ts,
      });
  }
  return getPerson(personId);
}

function updateProfile({
  id,
  displayName,
  notes,
  leadStatus,
  profile,
  primaryEmail,
  avatarUrl,
} = {}) {
  if (typeof id !== 'string' || !id) throw new Error('id required');
  const existing = db().prepare('SELECT * FROM people WHERE id = ?').get(id);
  if (!existing) throw new Error('Person not found');
  const ts = now();
  const nextStatus =
    leadStatus && LEAD_STATUSES.has(leadStatus) ? leadStatus : existing.lead_status || 'lead';
  const nextProfile =
    profile != null
      ? JSON.stringify(profile)
      : existing.profile_json || '{}';
  db()
    .prepare(
      `UPDATE people SET
        display_name = @display_name,
        notes = @notes,
        lead_status = @lead_status,
        profile_json = @profile_json,
        primary_email = @primary_email,
        avatar_url = @avatar_url,
        updated_at = @ts
       WHERE id = @id`,
    )
    .run({
      id,
      display_name:
        displayName != null ? String(displayName).trim() || existing.display_name : existing.display_name,
      notes: notes !== undefined ? notes : existing.notes,
      lead_status: nextStatus,
      profile_json: nextProfile,
      primary_email: primaryEmail !== undefined ? primaryEmail : existing.primary_email,
      avatar_url: avatarUrl !== undefined ? avatarUrl : existing.avatar_url,
      ts,
    });
  return getPerson(id, { includeInteractions: true });
}

function addInteraction({
  personId,
  projectId,
  kind,
  refType,
  refId,
  summary,
  payload,
  occurredAt,
} = {}) {
  if (typeof personId !== 'string' || !personId) throw new Error('personId required');
  const kindStr = String(kind || '').trim();
  if (!kindStr) throw new Error('kind required');
  const person = db().prepare('SELECT * FROM people WHERE id = ?').get(personId);
  if (!person) throw new Error('Person not found');
  const pid = normalizeProjectId(projectId ?? person.project_id);
  const ts = now();
  const id = secureTimestampId('pint');
  db()
    .prepare(
      `INSERT INTO person_interactions
        (id, person_id, project_id, kind, ref_type, ref_id, summary, payload, occurred_at, created_at, updated_at)
       VALUES (@id, @person_id, @project_id, @kind, @ref_type, @ref_id, @summary, @payload, @occurred_at, @ts, @ts)`,
    )
    .run({
      id,
      person_id: personId,
      project_id: pid,
      kind: kindStr,
      ref_type: refType ?? null,
      ref_id: refId ?? null,
      summary: summary ?? null,
      payload: payload != null ? JSON.stringify(payload) : '{}',
      occurred_at: occurredAt ?? ts,
      ts,
    });
  db()
    .prepare(`UPDATE people SET last_seen_at = ?, updated_at = ? WHERE id = ?`)
    .run(ts, ts, personId);
  return mapInteraction(
    db().prepare('SELECT * FROM person_interactions WHERE id = ?').get(id),
  );
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

/**
 * Apply a cloud enrich response (snake_case rows from provider) onto local SQLite.
 */
function applyCloudPersonEnrichment(personId, cloudPerson, cloudIdentity) {
  if (typeof personId !== 'string' || !personId) throw new Error('id required');
  const existing = db().prepare('SELECT * FROM people WHERE id = ?').get(personId);
  if (!existing) throw new Error('Person not found');

  const profile =
    cloudPerson?.profile_json && typeof cloudPerson.profile_json === 'object'
      ? cloudPerson.profile_json
      : parseJson(existing.profile_json, {});
  updateProfile({
    id: personId,
    displayName:
      typeof cloudPerson?.display_name === 'string' ? cloudPerson.display_name : undefined,
    avatarUrl:
      cloudPerson?.avatar_url !== undefined ? cloudPerson.avatar_url : undefined,
    profile,
  });

  if (cloudIdentity && typeof cloudIdentity === 'object') {
    const externalId = String(cloudIdentity.external_id || '').trim();
    if (externalId) {
      const meta =
        cloudIdentity.meta_json && typeof cloudIdentity.meta_json === 'object'
          ? cloudIdentity.meta_json
          : {};
      const identityId = String(cloudIdentity.id || '').trim();
      const ts = now();
      const localById = identityId
        ? db().prepare('SELECT * FROM person_identities WHERE id = ?').get(identityId)
        : null;
      const localByKey = db()
        .prepare(
          `SELECT * FROM person_identities
           WHERE project_id = ? AND source = 'social_instagram' AND external_id = ?`,
        )
        .get(existing.project_id, externalId);

      if (localById) {
        db()
          .prepare(
            `UPDATE person_identities SET
              person_id = @person_id,
              display_label = @display_label,
              meta_json = @meta_json,
              updated_at = @ts
             WHERE id = @id`,
          )
          .run({
            id: localById.id,
            person_id: personId,
            display_label: cloudIdentity.display_label ?? null,
            meta_json: JSON.stringify(meta),
            ts,
          });
      } else if (localByKey && identityId && identityId !== localByKey.id) {
        // Adopt cloud id so push does not fight UNIQUE(project_id, source, external_id).
        db().prepare('DELETE FROM person_identities WHERE id = ?').run(localByKey.id);
        db()
          .prepare(
            `INSERT INTO person_identities
              (id, person_id, project_id, source, external_id, display_label, meta_json, created_at, updated_at)
             VALUES (@id, @person_id, @project_id, 'social_instagram', @external_id, @display_label, @meta_json, @ts, @ts)`,
          )
          .run({
            id: identityId,
            person_id: personId,
            project_id: existing.project_id,
            external_id: externalId,
            display_label: cloudIdentity.display_label ?? null,
            meta_json: JSON.stringify(meta),
            ts,
          });
      } else if (localByKey) {
        db()
          .prepare(
            `UPDATE person_identities SET
              display_label = @display_label,
              meta_json = @meta_json,
              updated_at = @ts
             WHERE id = @id`,
          )
          .run({
            id: localByKey.id,
            display_label: cloudIdentity.display_label ?? null,
            meta_json: JSON.stringify(meta),
            ts,
          });
      } else if (identityId) {
        db()
          .prepare(
            `INSERT INTO person_identities
              (id, person_id, project_id, source, external_id, display_label, meta_json, created_at, updated_at)
             VALUES (@id, @person_id, @project_id, 'social_instagram', @external_id, @display_label, @meta_json, @ts, @ts)`,
          )
          .run({
            id: identityId,
            person_id: personId,
            project_id: existing.project_id,
            external_id: externalId,
            display_label: cloudIdentity.display_label ?? null,
            meta_json: JSON.stringify(meta),
            ts,
          });
      } else {
        linkIdentity({
          personId,
          projectId: existing.project_id,
          source: 'social_instagram',
          externalId,
          displayLabel: cloudIdentity.display_label ?? null,
          meta,
        });
      }
    }
  }

  return getPerson(personId, { includeInteractions: true });
}

/**
 * Hard-delete a person locally and enqueue Domain Sync tombstones so cloud
 * mirrors the delete (people / identities / interactions).
 */
function deletePerson(id) {
  if (typeof id !== 'string' || !id) throw new Error('id required');
  const person = db().prepare('SELECT id FROM people WHERE id = ?').get(id);
  if (!person) return { deleted: false };

  const identityIds = db()
    .prepare('SELECT id FROM person_identities WHERE person_id = ?')
    .all(id)
    .map((row) => row.id);
  const interactionIds = db()
    .prepare('SELECT id FROM person_interactions WHERE person_id = ?')
    .all(id)
    .map((row) => row.id);

  db().prepare('DELETE FROM person_interactions WHERE person_id = ?').run(id);
  db().prepare('DELETE FROM person_identities WHERE person_id = ?').run(id);
  db().prepare('DELETE FROM people WHERE id = ?').run(id);

  try {
    const syncTombstone = require('../storage/sync-tombstone.cjs');
    const database = db();
    const deletedAt = Date.now();
    for (const interactionId of interactionIds) {
      syncTombstone.recordTombstone(database, 'person_interactions', interactionId, deletedAt);
    }
    for (const identityId of identityIds) {
      syncTombstone.recordTombstone(database, 'person_identities', identityId, deletedAt);
    }
    syncTombstone.recordTombstone(database, 'people', id, deletedAt);
  } catch {
    /* sync optional */
  }

  try {
    const sourceIndex = require('../search/source-index.cjs');
    sourceIndex.removeDocument?.('person', id);
  } catch {
    /* index optional */
  }

  return { deleted: true, id };
}

function deletePeople(ids) {
  const list = Array.isArray(ids) ? ids.filter((id) => typeof id === 'string' && id) : [];
  let deleted = 0;
  for (const id of list) {
    const result = deletePerson(id);
    if (result.deleted) deleted += 1;
  }
  return { deleted, requested: list.length };
}

module.exports = {
  SOURCES,
  LEAD_STATUSES,
  getPerson,
  listPeople,
  upsertPerson,
  updateProfile,
  addInteraction,
  loadInteractions,
  linkIdentity,
  upsertIdentityPerson,
  searchPeople,
  syncGithubIdentitiesFromStore,
  deletePerson,
  deletePeople,
  applyCloudPersonEnrichment,
  normalizeExternalId,
  normalizeProjectId,
};
