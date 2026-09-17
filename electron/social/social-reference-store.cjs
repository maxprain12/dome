'use strict';

const crypto = require('node:crypto');
const { parseSocialUrl } = require('./social-url-parse.cjs');
const { decodeEntities, cleanProfileName } = require('./social-public-html.cjs');
const syncTombstone = require('../storage/sync-tombstone.cjs');

function parseJson(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function serializeReference(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    provider: row.provider,
    url: row.external_url,
    externalPostId: row.external_post_id,
    personId: row.person_id,
    resourceId: row.resource_id,
    title: row.title,
    body: row.body,
    format: row.format,
    topics: parseJson(row.topics_json, []),
    media: parseJson(row.media_json, []),
    metrics: parseJson(row.metrics_json, null),
    source: parseJson(row.source_json, null),
    sourceKind: row.source_kind,
    limitations: parseJson(row.limitations_json, []),
    capturedAt: row.captured_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: {
      name: row.title || row.display_name || row.provider,
      handle: parseJson(row.source_json, {})?.authorHandle || null,
      avatarUrl: parseJson(row.source_json, {})?.avatarUrl || null,
    },
    followers: parseJson(row.source_json, {})?.followers ?? null,
    following: parseJson(row.source_json, {})?.following ?? null,
    postsCount: parseJson(row.source_json, {})?.postsCount ?? null,
    kind: row.format === 'profile' ? 'profile' : 'post',
    publishedAt: parseJson(row.source_json, {})?.publishedAt ?? null,
  };
}

function serializeWatchlist(row, members = []) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    kind: row.kind,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    members,
  };
}

function avatarFromEvidence(member, references) {
  if (member?.avatarUrl) return member.avatarUrl;
  const handle = String(member?.handle || '').replace(/^@/, '').toLowerCase();
  const url = String(member?.profileUrl || '');
  const matches = (references || []).filter((item) => {
    if (!item?.author?.avatarUrl) return false;
    const itemHandle = String(item.author.handle || '').replace(/^@/, '').toLowerCase();
    if (handle && itemHandle && handle === itemHandle) return true;
    if (url && item.url && (item.url === url || String(item.url).startsWith(url))) return true;
    return false;
  });
  const profile = matches.find((item) => item.kind === 'profile' || item.format === 'profile');
  return (profile || matches[0])?.author?.avatarUrl || null;
}

function createSocialReferenceStore(database) {
  const q = () => database.getQueries();

  function capture({
    projectId = 'default',
    url,
    card = null,
    personId = null,
    resourceId = null,
    notes = null,
    sourceKind = 'manual',
    collectionId = null,
  }) {
    const parsed = parseSocialUrl(url);
    const canonical = card?.url || parsed?.canonicalUrl || String(url || '').split('?')[0];
    if (!canonical) throw new Error('A public URL is required.');
    const provider = card?.provider || parsed?.provider;
    if (!provider) throw new Error('Unsupported social URL.');
    const existing = q().getSocialReferenceByUrl.get(projectId, canonical);
    const now = Date.now();
    const rawTitle =
      card?.author?.name ||
      card?.title ||
      parsed?.handle ||
      provider;
    const title = cleanProfileName(decodeEntities(String(rawTitle || '')), parsed?.handle || card?.author?.handle)
      || decodeEntities(String(rawTitle || ''))
      || provider;
    const payload = {
      personId: personId || existing?.person_id || null,
      resourceId: resourceId || existing?.resource_id || null,
      title,
      body: card?.body || existing?.body || null,
      format: card?.kind === 'profile' ? 'profile' : card?.format || parsed?.kind || null,
      topics: card?.topics || [],
      media: card?.media || [],
      metrics: card?.metrics || null,
      source: {
        authorName: card?.author?.name,
        authorHandle: card?.author?.handle,
        avatarUrl: card?.author?.avatarUrl,
        followers: card?.followers ?? null,
        following: card?.following ?? null,
        postsCount: card?.postsCount ?? null,
        publishedAt: card?.publishedAt ?? null,
      },
      sourceKind: card?.fetchMethod || sourceKind,
      limitations: card?.limitations || [],
      notes: notes ?? existing?.notes ?? null,
    };
    if (existing) {
      q().updateSocialReference.run(
        payload.personId, payload.resourceId, payload.title, payload.body, payload.format,
        JSON.stringify(payload.topics), JSON.stringify(payload.media),
        payload.metrics ? JSON.stringify(payload.metrics) : null,
        JSON.stringify(payload.source), payload.sourceKind, JSON.stringify(payload.limitations),
        now, payload.notes, now, existing.id,
      );
      if (collectionId) addToCollection(collectionId, existing.id);
      return { reference: serializeReference(q().getSocialReferenceById.get(existing.id)), created: false };
    }
    const id = `sr-${crypto.randomBytes(8).toString('hex')}`;
    q().insertSocialReference.run(
      id, projectId, provider, canonical, parsed?.kind === 'post' ? parsed.externalId : null,
      payload.personId, payload.resourceId, payload.title, payload.body, payload.format,
      JSON.stringify(payload.topics), JSON.stringify(payload.media),
      payload.metrics ? JSON.stringify(payload.metrics) : null,
      JSON.stringify(payload.source), payload.sourceKind, JSON.stringify(payload.limitations),
      now, payload.notes, now, now,
    );
    if (collectionId) addToCollection(collectionId, id);
    return { reference: serializeReference(q().getSocialReferenceById.get(id)), created: true };
  }

  function listReferences({ projectId = 'default', limit = 80 } = {}) {
    return q().listSocialReferences.all(projectId, limit).map(serializeReference);
  }

  function getReference(id) {
    return serializeReference(q().getSocialReferenceById.get(id));
  }

  function deleteReference(id) {
    const db = database.getDB?.();
    if (db) syncTombstone.recordTombstone(db, 'social_references', id);
    q().deleteSocialReference.run(id);
    return { success: true };
  }

  function ensureDefaultWatchlists(projectId = 'default') {
    const existing = listWatchlists({ projectId });
    if (existing.length > 0) return existing;
    createWatchlist({ projectId, name: 'Competitors', kind: 'competitor' });
    createWatchlist({ projectId, name: 'Inspiration', kind: 'inspiration' });
    createWatchlist({ projectId, name: 'Following', kind: 'following' });
    return listWatchlists({ projectId });
  }

  function listCollections({ projectId = 'default' } = {}) {
    return q().listSocialCollections.all(projectId).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      kind: row.kind,
      itemIds: q().listSocialCollectionItems.all(row.id).map((item) => item.reference_id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  function createCollection({ projectId = 'default', name, description = null, kind = 'inspiration' }) {
    const now = Date.now();
    const id = `sco-${crypto.randomBytes(6).toString('hex')}`;
    q().insertSocialCollection.run(id, projectId, name, description, kind, now, now);
    return listCollections({ projectId }).find((item) => item.id === id);
  }

  function addToCollection(collectionId, referenceId) {
    q().addSocialCollectionItem.run(collectionId, referenceId, 0, Date.now());
  }

  function removeFromCollection(collectionId, referenceId) {
    q().removeSocialCollectionItem.run(collectionId, referenceId);
  }

  function listWatchlists({ projectId = 'default' } = {}) {
    const references = listReferences({ projectId, limit: 400 });
    return q().listSocialWatchlists.all(projectId).map((row) =>
      serializeWatchlist(row, q().listSocialWatchlistMembers.all(row.id).map((member) => {
        const next = {
          personId: member.person_id,
          role: member.role,
          notes: member.notes,
          handle: member.handle,
          provider: member.provider,
          profileUrl: member.profile_url,
          avatarUrl: member.avatar_url,
          displayName: member.display_name,
        };
        next.avatarUrl = avatarFromEvidence(next, references);
        return next;
      })),
    );
  }

  function createWatchlist({ projectId = 'default', name, kind = 'competitor' }) {
    const now = Date.now();
    const id = `swl-${crypto.randomBytes(6).toString('hex')}`;
    q().insertSocialWatchlist.run(id, projectId, name, kind, now, now);
    return serializeWatchlist(q().getSocialWatchlistById.get(id), []);
  }

  function addWatchlistMember(watchlistId, member) {
    const existingMembers = q().listSocialWatchlistMembers.all(watchlistId);
    const handle = String(member.handle || '').replace(/^@/, '').trim().toLowerCase();
    const url = member.profileUrl || null;
    const matched = existingMembers.find((row) => {
      const rowHandle = String(row.handle || '').replace(/^@/, '').trim().toLowerCase();
      if (handle && rowHandle && handle === rowHandle && (!member.provider || row.provider === member.provider)) {
        return true;
      }
      return Boolean(url && row.profile_url && row.profile_url === url);
    });
    const personId = member.personId || matched?.person_id || `swm-${crypto.randomBytes(6).toString('hex')}`;
    const now = Date.now();
    const displayName = cleanProfileName(
      decodeEntities(String(member.displayName || member.handle || '')),
      member.handle,
    ) || member.handle || null;
    q().upsertSocialWatchlistMember.run(
      watchlistId,
      personId,
      member.role || matched?.role || null,
      member.notes || matched?.notes || null,
      member.handle || matched?.handle || null,
      member.provider || matched?.provider || null,
      url || matched?.profile_url || null,
      member.avatarUrl || matched?.avatar_url || null,
      displayName,
      matched?.created_at || now,
      now,
    );
    return listWatchlists({}).find((list) => list.id === watchlistId)
      || serializeWatchlist(q().getSocialWatchlistById.get(watchlistId), q().listSocialWatchlistMembers.all(watchlistId));
  }

  function removeWatchlistMember(watchlistId, personId) {
    q().deleteSocialWatchlistMember.run(watchlistId, personId);
  }

  function linkCampaignReference(campaignId, referenceId, notes = null) {
    q().insertSocialCampaignReference.run(campaignId, referenceId, notes, Date.now());
  }

  function unlinkCampaignReference(campaignId, referenceId) {
    q().deleteSocialCampaignReference.run(campaignId, referenceId);
  }

  function listCampaignReferences(campaignId) {
    return q().listSocialCampaignReferenceIds.all(campaignId)
      .map((row) => serializeReference(q().getSocialReferenceById.get(row.reference_id)))
      .filter(Boolean);
  }

  function serializeExploration(row) {
    if (!row) return null;
    return {
      id: row.id,
      projectId: row.project_id,
      personId: row.person_id,
      watchlistKind: row.watchlist_kind,
      recipeId: row.recipe_id,
      status: row.status,
      summary: row.summary,
      payload: parseJson(row.payload_json, null),
      limitations: parseJson(row.limitations_json, []),
      runId: row.run_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
    };
  }

  function createExploration({
    projectId = 'default',
    personId,
    watchlistKind,
    recipeId,
    status = 'queued',
    summary = null,
  }) {
    const now = Date.now();
    const id = `sxp-${crypto.randomBytes(8).toString('hex')}`;
    q().insertSocialExploration.run(
      id, projectId, personId, watchlistKind, recipeId, status, summary, null, '[]', null, now, now, null, null,
    );
    return serializeExploration(q().getSocialExplorationById.get(id));
  }

  function updateExploration(id, patch) {
    const row = q().getSocialExplorationById.get(id);
    if (!row) throw new Error('Exploration not found');
    const next = {
      status: patch.status || row.status,
      summary: patch.summary !== undefined ? patch.summary : row.summary,
      payload: patch.payload !== undefined ? patch.payload : parseJson(row.payload_json, null),
      limitations: patch.limitations !== undefined ? patch.limitations : parseJson(row.limitations_json, []),
      runId: patch.runId !== undefined ? patch.runId : row.run_id,
      startedAt: patch.startedAt !== undefined ? patch.startedAt : row.started_at,
      completedAt: patch.completedAt !== undefined ? patch.completedAt : row.completed_at,
    };
    q().updateSocialExploration.run(
      next.status,
      next.summary,
      next.payload ? JSON.stringify(next.payload).slice(0, 120000) : null,
      JSON.stringify(next.limitations || []),
      next.runId,
      Date.now(),
      next.startedAt,
      next.completedAt,
      id,
    );
    return serializeExploration(q().getSocialExplorationById.get(id));
  }

  function listExplorations({ projectId = 'default', personId, limit = 20 } = {}) {
    if (!personId) return [];
    return q().listSocialExplorationsByPerson.all(projectId, personId, limit).map(serializeExploration);
  }

  function listQueuedExplorations(limit = 1) {
    return q().listQueuedSocialExplorations.all(limit).map(serializeExploration);
  }

  function getExploration(id) {
    return serializeExploration(q().getSocialExplorationById.get(id));
  }

  function latestExploration(projectId, personId, recipeId) {
    return serializeExploration(q().listLatestSocialExplorationByRecipe.get(projectId, personId, recipeId));
  }

  function serializeSuggestion(row) {
    if (!row) return null;
    return {
      id: row.id,
      projectId: row.project_id,
      provider: row.provider,
      handle: row.handle,
      displayName: row.display_name,
      profileUrl: row.profile_url,
      avatarUrl: row.avatar_url,
      reason: row.reason,
      reasonDetail: row.reason_detail,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function upsertSuggestion(input) {
    const now = Date.now();
    const profileUrl = input.profileUrl || null;
    if (!profileUrl) return null;
    const existing = q().listSocialCreatorSuggestions.all(input.projectId || 'default', 'pending', 80)
      .concat(q().listSocialCreatorSuggestions.all(input.projectId || 'default', 'dismissed', 80))
      .concat(q().listSocialCreatorSuggestions.all(input.projectId || 'default', 'accepted', 80))
      .find((row) => row.profile_url === profileUrl && row.provider === input.provider);
    if (existing && (existing.status === 'dismissed' || existing.status === 'accepted')) {
      return serializeSuggestion(existing);
    }
    const id = existing?.id || `scs-${crypto.randomBytes(6).toString('hex')}`;
    q().insertSocialCreatorSuggestion.run(
      id,
      input.projectId || 'default',
      input.provider,
      input.handle || null,
      input.displayName || input.handle || null,
      profileUrl,
      input.avatarUrl || null,
      input.reason || 'public',
      input.reasonDetail || null,
      existing?.status || 'pending',
      existing?.created_at || now,
      now,
    );
    return serializeSuggestion(q().getSocialCreatorSuggestionById.get(id));
  }

  function listSuggestions({ projectId = 'default', status = 'pending', limit = 12 } = {}) {
    return q().listSocialCreatorSuggestions.all(projectId, status, limit).map(serializeSuggestion);
  }

  function setSuggestionStatus(id, status) {
    q().updateSocialCreatorSuggestionStatus.run(status, Date.now(), id);
    return serializeSuggestion(q().getSocialCreatorSuggestionById.get(id));
  }

  function getSuggestion(id) {
    return serializeSuggestion(q().getSocialCreatorSuggestionById.get(id));
  }

  function saveTrendSnapshot({ projectId = 'default', periodDays = 30, payload }) {
    const id = `sts-${crypto.randomBytes(8).toString('hex')}`;
    q().insertSocialTrendSnapshot.run(id, projectId, periodDays, JSON.stringify(payload).slice(0, 120000), Date.now());
    return getTrendSnapshots({ projectId, limit: 1 })[0];
  }

  function getTrendSnapshots({ projectId = 'default', limit = 10 } = {}) {
    return q().listSocialTrendSnapshots.all(projectId, limit).map((row) => ({
      id: row.id,
      periodDays: row.period_days,
      createdAt: row.created_at,
      ...parseJson(row.payload_json, {}),
    }));
  }

  return {
    capture,
    listReferences,
    getReference,
    deleteReference,
    listCollections,
    createCollection,
    addToCollection,
    removeFromCollection,
    listWatchlists,
    ensureDefaultWatchlists,
    createWatchlist,
    addWatchlistMember,
    removeWatchlistMember,
    linkCampaignReference,
    unlinkCampaignReference,
    listCampaignReferences,
    saveTrendSnapshot,
    getTrendSnapshots,
    createExploration,
    updateExploration,
    listExplorations,
    listQueuedExplorations,
    getExploration,
    latestExploration,
    upsertSuggestion,
    listSuggestions,
    setSuggestionStatus,
    getSuggestion,
  };
}

module.exports = { createSocialReferenceStore, avatarFromEvidence };
