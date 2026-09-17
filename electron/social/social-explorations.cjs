'use strict';

/* eslint-disable no-console */

const { parseSocialUrl } = require('./social-url-parse.cjs');
const { persistSocialAvatar } = require('./social-avatar-cache.cjs');

const DEFAULT_RECIPES = {
  competitor: [
    { id: 'hooks', enabled: true, cadence: 'weekly' },
    { id: 'formats', enabled: true, cadence: 'weekly' },
  ],
  inspiration: [
    { id: 'formats', enabled: true, cadence: 'weekly' },
    { id: 'rhythm', enabled: true, cadence: 'weekly' },
  ],
  following: [
    { id: 'this_week', enabled: true, cadence: 'daily' },
  ],
};

const RECIPE_FOCUS = {
  hooks: 'Recent public hooks and opening lines. Cite captions. Do not invent metrics.',
  formats: 'Mix of formats (reel, post, carousel) visible in saved evidence. Cite post URLs. Omit views/likes if missing.',
  rhythm: 'How often they publish based only on dated public posts we captured.',
  this_week: 'What they published recently that overlaps the user topics. Omit missing dates.',
};

const CADENCE_MS = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  manual: Number.POSITIVE_INFINITY,
};

function cloneRecipes(value) {
  return JSON.parse(JSON.stringify(value || DEFAULT_RECIPES));
}

function getRecipes(database) {
  try {
    const raw = database?.getQueries?.().getSetting?.get('social_exploration_recipes')?.value;
    if (!raw) return cloneRecipes(DEFAULT_RECIPES);
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object') return cloneRecipes(DEFAULT_RECIPES);
    return { ...cloneRecipes(DEFAULT_RECIPES), ...parsed };
  } catch {
    return cloneRecipes(DEFAULT_RECIPES);
  }
}

function saveRecipes(database, recipes) {
  const next = { ...cloneRecipes(DEFAULT_RECIPES), ...(recipes || {}) };
  database.getQueries().setSetting.run('social_exploration_recipes', JSON.stringify(next), Date.now());
  return next;
}

function findMember(references, personId, projectId = 'default') {
  for (const list of references.listWatchlists({ projectId })) {
    const member = (list.members || []).find((item) => item.personId === personId);
    if (member) return { list, member };
  }
  return null;
}

function evidenceForMember(references, member, projectId) {
  const handle = String(member.handle || '').replace(/^@/, '').toLowerCase();
  const url = member.profileUrl || '';
  return references.listReferences({ projectId, limit: 120 }).filter((item) => {
    const itemHandle = String(item.author?.handle || '').replace(/^@/, '').toLowerCase();
    if (handle && itemHandle && handle === itemHandle) return true;
    if (url && item.url && (item.url === url || item.url.startsWith(url))) return true;
    return false;
  });
}

function structuredSummary(recipeId, member, pack) {
  const posts = pack.posts || [];
  const formats = [...new Set(posts.map((post) => post.format).filter(Boolean))];
  const topics = [...new Set(posts.flatMap((post) => post.topics || []))].slice(0, 8);
  const hooks = posts
    .map((post) => String(post.body || '').trim().split('\n')[0])
    .filter(Boolean)
    .slice(0, 4);
  const lines = [
    `${member.displayName || member.handle || 'Creator'} · ${recipeId}`,
    pack.theme ? `Theme: ${pack.theme}` : null,
    pack.limitations?.length ? `Limits: ${pack.limitations.join(', ')}` : null,
    formats.length ? `Formats: ${formats.join(', ')}` : 'No public formats captured.',
    topics.length ? `Topics: ${topics.join(', ')}` : null,
    hooks.length ? `Hooks: ${hooks.map((hook) => `“${hook.slice(0, 80)}”`).join(' · ')}` : null,
    `${posts.length} public posts saved as evidence.`,
  ].filter(Boolean);
  return lines.join('\n');
}

async function refreshPublicEvidence(service, member, projectId = 'default') {
  const url = member.profileUrl;
  if (!url) return { card: null, captured: 0, limitations: ['requires_browser'] };
  const resolved = await service.resolvePublic(url);
  const card = resolved?.card || null;
  if (!card) return { card: null, captured: 0, limitations: ['requires_browser'] };
  service.references.capture({ projectId, url: card.url || url, card, sourceKind: card.fetchMethod || 'open_graph' });
  let captured = 0;
  for (const post of (card.recentPosts || []).slice(0, 8)) {
    if (!post?.url) continue;
    service.references.capture({ projectId, url: post.url, card: post, sourceKind: post.fetchMethod || 'open_graph' });
    captured += 1;
  }
  const remoteAvatar = card.author?.avatarUrl || null;
  if (remoteAvatar && member.personId) {
    const found = findMember(service.references, member.personId, projectId);
    if (found) {
      let avatarUrl = remoteAvatar;
      try {
        avatarUrl = await persistSocialAvatar({
          remoteUrl: remoteAvatar,
          provider: card.provider || member.provider,
          handle: member.handle || card.author?.handle,
          currentUrl: member.avatarUrl,
        }) || remoteAvatar;
      } catch (err) {
        console.warn('[Social] creator avatar persist skipped:', err.message);
      }
      service.references.addWatchlistMember(found.list.id, {
        personId: member.personId,
        handle: member.handle || card.author?.handle,
        provider: member.provider || card.provider,
        profileUrl: member.profileUrl || card.url,
        displayName: member.displayName || card.author?.name,
        avatarUrl,
      });
    }
  }
  return { card, captured, limitations: card.limitations || [] };
}

async function maybeLlmSummary({ recipeId, member, pack, language = 'es' }) {
  try {
    const { getAISettings } = require('../ai/ai-settings.cjs');
    const llmService = require('../ai/llm-service.cjs');
    const database = require('../core/database.cjs');
    const ai = await getAISettings(database);
    if (!ai?.provider) return null;
    if (!ai.apiKey && ai.provider !== 'ollama' && ai.provider !== 'vllm' && ai.provider !== 'lmstudio') {
      return null;
    }
    const result = await llmService.chat({
      provider: ai.provider,
      model: ai.model,
      apiKey: ai.apiKey,
      baseUrl: ai.baseUrl,
      messages: [
        {
          role: 'system',
          content: [
            'You write a short social exploration note for a saved public creator.',
            'Use only the JSON evidence. Never invent metrics, followers, or views.',
            'If posts exist, describe their formats, captions and URLs. Omit likes/views when metrics are missing.',
            'If limitations include login_wall or requires_browser AND posts is empty, say the capture is incomplete.',
            'Do not claim the page failed to load when followers, postsCount, or posts[] are present.',
            RECIPE_FOCUS[recipeId] || RECIPE_FOCUS.hooks,
            'Max 120 words. Cite handles and post titles/URLs from the JSON.',
          ].join(' '),
        },
        {
          role: 'user',
          content: `Language: ${language}. Creator: ${member.displayName || member.handle}. Recipe: ${recipeId}.\n${JSON.stringify(pack)}`,
        },
      ],
      options: { maxTokens: 400, temperature: 0.3 },
    });
    const text = String(result?.text || '').trim();
    return text || null;
  } catch (err) {
    console.warn('[Social] exploration LLM skipped:', err.message);
    return null;
  }
}

async function runExploration(service, {
  projectId = 'default',
  personId,
  recipeId = 'hooks',
  watchlistKind = 'inspiration',
  explorationId = null,
  theme = null,
} = {}) {
  const found = findMember(service.references, personId, projectId);
  if (!found) throw new Error('Creator not found on a watchlist.');
  const { member, list } = found;
  const kind = list.kind || watchlistKind;
  const exploration = explorationId
    ? service.references.updateExploration(explorationId, { status: 'running', startedAt: Date.now() })
    : service.references.createExploration({
      projectId,
      personId,
      watchlistKind: kind,
      recipeId,
      status: 'running',
    });
  if (!explorationId) {
    service.references.updateExploration(exploration.id, { startedAt: Date.now(), status: 'running' });
  }
  const focusTheme = theme || exploration.payload?.theme || null;
  try {
    const refreshed = await refreshPublicEvidence(service, member, projectId);
    const evidence = evidenceForMember(service.references, member, projectId);
    const pack = {
      handle: member.handle,
      url: member.profileUrl,
      theme: focusTheme,
      followers: evidence.find((item) => item.kind === 'profile')?.followers ?? null,
      postsCount: evidence.find((item) => item.kind === 'profile')?.postsCount ?? null,
      limitations: refreshed.limitations,
      posts: evidence.filter((item) => item.kind !== 'profile').slice(0, 8).map((item) => ({
        title: item.title,
        url: item.url,
        format: item.format,
        topics: item.topics,
        body: item.body,
        metrics: item.metrics,
        limitations: item.limitations,
      })),
    };
    const llm = await maybeLlmSummary({ recipeId, member, pack });
    const summary = llm || structuredSummary(recipeId, member, pack);
    const limited = (refreshed.limitations || []).some(
      (item) => item === 'login_wall' || item === 'requires_browser',
    ) && pack.posts.length === 0;
    return service.references.updateExploration(exploration.id, {
      status: limited ? 'limited' : 'ready',
      summary,
      payload: pack,
      limitations: refreshed.limitations,
      completedAt: Date.now(),
    });
  } catch (err) {
    return service.references.updateExploration(exploration.id, {
      status: 'failed',
      summary: err.message,
      completedAt: Date.now(),
    });
  }
}

function cancelExploration(service, explorationId) {
  const row = service.references.getExploration(explorationId);
  if (!row) throw new Error('Exploration not found');
  if (row.status === 'ready' || row.status === 'limited' || row.status === 'failed') return row;
  return service.references.updateExploration(explorationId, {
    status: 'cancelled',
    completedAt: Date.now(),
  });
}

function ownHandleSet(store) {
  return new Set(
    (store.listAccounts() || [])
      .map((account) => String(account.handle || '').replace(/^@/, '').toLowerCase())
      .filter(Boolean),
  );
}

function publicUrlFor(provider, handle) {
  const slug = String(handle || '').replace(/^@/, '').trim();
  if (!slug) return null;
  if (provider === 'instagram') return `https://www.instagram.com/${slug}/`;
  if (provider === 'x') return `https://x.com/${slug}`;
  if (provider === 'linkedin') return null;
  return null;
}

function watchlistUrls(references, projectId) {
  const urls = new Set();
  const handles = new Set();
  for (const list of references.ensureDefaultWatchlists(projectId)) {
    for (const member of list.members || []) {
      if (member.profileUrl) urls.add(member.profileUrl);
      const handle = String(member.handle || '').replace(/^@/, '').toLowerCase();
      if (handle) handles.add(`${member.provider || ''}:${handle}`);
    }
  }
  return { urls, handles };
}

function ownTopicsAndHashtags(store) {
  const tags = new Set();
  for (const post of store.listPosts({ limit: 120 }) || []) {
    if (!['published', 'imported'].includes(post.status)) continue;
    for (const topic of post.topics || post.themes || []) {
      const normalized = String(topic).replace(/^#/, '').toLowerCase().trim();
      if (normalized) tags.add(normalized);
    }
    for (const tag of String(post.body || post.caption || '').match(/#[\p{L}\p{N}_]+/gu) || []) {
      tags.add(tag.replace(/^#/, '').toLowerCase());
    }
  }
  return tags;
}

function overlappingTopic(ref, tags) {
  const hay = [
    ...(ref.topics || []),
    ...(String(ref.body || '').match(/#[\p{L}\p{N}_]+/gu) || []),
  ].map((item) => String(item).replace(/^#/, '').toLowerCase());
  return hay.find((item) => tags.has(item)) || null;
}

function refreshSuggestions(service, { projectId = 'default' } = {}) {
  const own = ownHandleSet(service.store);
  const listed = watchlistUrls(service.references, projectId);
  const tags = ownTopicsAndHashtags(service.store);
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const pending = service.references.listSuggestions({ projectId, status: 'pending', limit: 80 });
  const weekCounts = { linkedin: 0, instagram: 0, x: 0 };
  for (const row of pending) {
    if ((row.createdAt || 0) >= weekAgo && weekCounts[row.provider] != null) {
      weekCounts[row.provider] += 1;
    }
  }

  const trySuggest = (input) => {
    if ((weekCounts[input.provider] || 0) >= 5) return null;
    const already = pending.some((row) => row.profileUrl === input.profileUrl && row.provider === input.provider);
    const row = service.references.upsertSuggestion(input);
    if (row?.status === 'pending' && !already) {
      weekCounts[input.provider] = (weekCounts[input.provider] || 0) + 1;
      pending.push(row);
    }
    return row;
  };

  for (const ref of service.references.listReferences({ projectId, limit: 120 })) {
    if (ref.kind !== 'profile') continue;
    const handle = String(ref.author?.handle || '').replace(/^@/, '').toLowerCase();
    if (handle && own.has(handle)) continue;
    if (ref.url && listed.urls.has(ref.url)) continue;
    if (handle && listed.handles.has(`${ref.provider}:${handle}`)) continue;
    const overlap = overlappingTopic(ref, tags);
    trySuggest({
      projectId,
      provider: ref.provider,
      handle: ref.author?.handle,
      displayName: ref.author?.name || ref.title,
      profileUrl: ref.url,
      avatarUrl: ref.author?.avatarUrl,
      reason: overlap ? 'hashtag' : 'public',
      reasonDetail: overlap
        ? `#${overlap}`
        : (ref.author?.handle ? `@${String(ref.author.handle).replace(/^@/, '')}` : ref.title),
    });
  }

  for (const draft of service.store.listReplyDrafts() || []) {
    const handle = String(draft.commentAuthor || '')
      .replace(/^@/, '')
      .trim();
    if (!handle || handle.includes(' ')) continue;
    const key = handle.toLowerCase();
    if (own.has(key)) continue;
    const provider = draft.provider || 'instagram';
    if (listed.handles.has(`${provider}:${key}`)) continue;
    const profileUrl = publicUrlFor(provider, handle);
    if (!profileUrl) continue;
    trySuggest({
      projectId,
      provider,
      handle,
      displayName: handle,
      profileUrl,
      reason: 'comment',
      reasonDetail: draft.commentText ? String(draft.commentText).slice(0, 80) : handle,
    });
  }

  return service.references.listSuggestions({ projectId, status: 'pending', limit: 8 });
}

function dueScheduledExplorations(service, { projectId = 'default' } = {}) {
  const recipes = getRecipes(service.database);
  const due = [];
  for (const list of service.references.ensureDefaultWatchlists(projectId)) {
    const kindRecipes = recipes[list.kind] || [];
    for (const member of list.members || []) {
      for (const recipe of kindRecipes) {
        if (!recipe.enabled || recipe.cadence === 'manual') continue;
        const windowMs = CADENCE_MS[recipe.cadence] || CADENCE_MS.weekly;
        const latest = service.references.latestExploration(projectId, member.personId, recipe.id);
        if (latest && (latest.status === 'running' || latest.status === 'queued')) continue;
        const at = latest?.completedAt || latest?.createdAt || 0;
        if (Date.now() - at < windowMs) continue;
        due.push({ personId: member.personId, recipeId: recipe.id, watchlistKind: list.kind });
      }
    }
  }
  return due.slice(0, 3);
}

function membersMatchingTheme(service, { projectId = 'default', theme, provider = null } = {}) {
  const needle = String(theme || '').replace(/^#/, '').toLowerCase().trim();
  if (!needle) return [];
  const matches = [];
  for (const list of service.references.ensureDefaultWatchlists(projectId)) {
    for (const member of list.members || []) {
      if (provider && member.provider && member.provider !== provider) continue;
      const evidence = evidenceForMember(service.references, member, projectId);
      const hay = [
        member.handle,
        member.displayName,
        ...evidence.flatMap((item) => [item.title, item.body, ...(item.topics || [])]),
      ].join(' ').toLowerCase();
      if (!hay.includes(needle)) continue;
      matches.push({
        personId: member.personId,
        watchlistKind: list.kind,
        handle: member.handle,
        displayName: member.displayName,
      });
    }
  }
  return matches.slice(0, 3);
}

function queueThemeExplorations(service, { projectId = 'default', theme, provider = null } = {}) {
  const matches = membersMatchingTheme(service, { projectId, theme, provider });
  const queued = [];
  for (const match of matches) {
    const latest = service.references.latestExploration(projectId, match.personId, 'this_week');
    if (latest && (latest.status === 'queued' || latest.status === 'running')) continue;
    const row = service.references.createExploration({
      projectId,
      personId: match.personId,
      watchlistKind: match.watchlistKind,
      recipeId: 'this_week',
      status: 'queued',
    });
    service.references.updateExploration(row.id, { payload: { theme } });
    queued.push({ ...match, explorationId: row.id });
  }
  return { theme, queued: queued.length, creators: queued };
}

module.exports = {
  DEFAULT_RECIPES,
  RECIPE_FOCUS,
  getRecipes,
  saveRecipes,
  runExploration,
  cancelExploration,
  refreshSuggestions,
  dueScheduledExplorations,
  membersMatchingTheme,
  queueThemeExplorations,
  evidenceForMember,
  parseSocialUrl,
};
