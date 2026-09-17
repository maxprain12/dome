'use strict';

const { buildRadarFeeds } = require('./radar/radar-feed.cjs');
const { enrichCluster } = require('./radar/radar-enrich.cjs');

const WINDOW_DAYS = new Set([7, 30, 90]);

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function parseThemes(value) {
  if (Array.isArray(value)) return uniqueSorted(value.map((item) => String(item).trim()).filter(Boolean));
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? uniqueSorted(parsed.map((item) => String(item).trim()).filter(Boolean)) : [];
  } catch {
    return uniqueSorted(value.split(',').map((item) => item.trim()).filter(Boolean));
  }
}

function extractHashtags(text) {
  return uniqueSorted(String(text || '').match(/#[\p{L}\p{N}_]+/gu) || []);
}

function provenanceOf(kind) {
  switch (kind) {
    case 'own':
      return 'oauth_own';
    case 'reference':
      return 'manual';
    case 'web':
      return 'web_search';
    case 'browser':
      return 'browser_capture';
    default:
      return 'derived_synthesis';
  }
}

function contentFormat(value) {
  const format = String(value || '').trim().toLowerCase();
  if (!format || format === 'profile') return null;
  return format;
}

function engagementScore(metrics) {
  if (!metrics || typeof metrics !== 'object') return null;
  const likes = typeof metrics.likes === 'number' ? metrics.likes : 0;
  const comments = typeof metrics.comments === 'number' ? metrics.comments : 0;
  const views = typeof metrics.impressions === 'number' ? metrics.impressions : 0;
  const hasAny = metrics.likes != null || metrics.comments != null || metrics.impressions != null;
  if (!hasAny) return null;
  return views + likes * 12 + comments * 20;
}

function asTrendCreative(item, origin) {
  const format = contentFormat(item.format || item.source?.format);
  const media = Array.isArray(item.media) ? item.media : [];
  const isVideo = format === 'reel'
    || media.some((entry) => entry?.type === 'video' || entry?.type === 'reel');
  const title = String(item.body || item.text || item.caption || item.title || '').trim().split('\n')[0] || null;
  const url = item.url || item.externalUrl || null;
  if (!format && media.length === 0 && !url) return null;
  if (item.kind === 'profile' || item.format === 'profile') return null;
  return {
    origin,
    provider: item.provider || null,
    format,
    isVideo,
    title,
    url,
    author: {
      name: item.author?.name || item.source?.authorName || item.title || item.provider || 'post',
      handle: item.author?.handle || item.source?.authorHandle || null,
      avatarUrl: item.author?.avatarUrl || item.source?.avatarUrl || null,
    },
    media,
    metrics: item.metrics || null,
    topics: uniqueSorted([
      ...parseThemes(item.topics || item.themes),
      ...extractHashtags(item.body || item.text || item.caption || ''),
    ]).slice(0, 6),
    publishedAt: item.publishedAt || item.capturedAt || null,
    engagementScore: engagementScore(item.metrics),
  };
}

function recommendedCreativeFormat(creatives) {
  const scored = { reel: 0, carousel: 0, post: 0 };
  for (const item of creatives) {
    const key = item.isVideo ? 'reel' : item.format === 'carousel' ? 'carousel' : 'post';
    scored[key] += item.engagementScore != null ? item.engagementScore : 1;
  }
  const winner = Object.entries(scored)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    [0];
  return winner && winner[1] > 0 ? winner[0] : null;
}

function buildTrendCreatives({ ownPosts, references }) {
  const creatives = [
    ...ownPosts.map((post) => asTrendCreative(post, 'own')),
    ...references.map((ref) => asTrendCreative(ref, 'reference')),
  ]
    .filter(Boolean)
    .sort((a, b) => {
      const videoBoost = (item) => (item.isVideo ? 1 : 0);
      const score = (item) => (item.engagementScore == null ? -1 : item.engagementScore);
      return videoBoost(b) - videoBoost(a)
        || score(b) - score(a)
        || (b.publishedAt || 0) - (a.publishedAt || 0);
    })
    .slice(0, 18);

  const mix = {
    video: creatives.filter((item) => item.isVideo).length,
    carousel: creatives.filter((item) => item.format === 'carousel').length,
    post: creatives.filter((item) => !item.isVideo && item.format !== 'carousel').length,
  };

  return {
    creatives,
    mix,
    recommendedFormat: recommendedCreativeFormat(creatives),
  };
}

function buildTrendSignals({ ownPosts, references, windowDays }) {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const recentOwn = ownPosts.filter((post) => {
    const at = post.publishedAt || post.createdAt || 0;
    return at >= cutoff && ['published', 'imported'].includes(post.status);
  });
  const recentRefs = references.filter((ref) => (ref.capturedAt || 0) >= cutoff);

  const themeCounts = new Map();
  const addTheme = (theme, kind, provider) => {
    const entry = themeCounts.get(theme) || { theme, own: 0, references: 0, providers: new Set() };
    if (kind === 'own') entry.own += 1;
    else entry.references += 1;
    if (provider) entry.providers.add(provider);
    themeCounts.set(theme, entry);
  };
  for (const post of recentOwn) {
    const provider = post.provider;
    for (const theme of [
      ...parseThemes(post.topics || post.themes),
      ...extractHashtags(post.body || post.caption || post.title),
    ]) {
      addTheme(theme, 'own', provider);
    }
  }
  for (const ref of recentRefs) {
    const provider = ref.provider;
    for (const theme of [
      ...parseThemes(ref.themes),
      ...extractHashtags(ref.text || ''),
    ]) {
      addTheme(theme, 'reference', provider);
    }
  }

  const signals = [...themeCounts.values()]
    .map((entry) => {
      const sources = [];
      if (entry.own > 0) sources.push('oauth_own');
      if (entry.references > 0) sources.push('manual');
      return {
        id: `trend-${entry.theme.toLowerCase().replace(/\s+/g, '-')}`,
        theme: entry.theme,
        kind: entry.own > 0 && entry.references > 0 ? 'shared' : entry.own > 0 ? 'own' : 'reference',
        windowDays,
        ownCount: entry.own,
        referenceCount: entry.references,
        score: entry.own * 2 + entry.references,
        confidence: Math.min(1, (entry.own + entry.references) / 8),
        provenance: sources[0] || provenanceOf('derived'),
        sources,
        providers: [...(entry.providers || [])].sort((a, b) => a.localeCompare(b)),
        labelKind: entry.own > 0 && entry.references === 0
          ? 'works_on_your_accounts'
          : entry.references > 0 && entry.own === 0
            ? 'appears_in_references'
            : 'shared_pattern',
      };
    })
    .sort((a, b) => b.score - a.score || a.theme.localeCompare(b.theme))
    .slice(0, 24);

  const ownFormats = recentOwn.map((post) => contentFormat(post.format || post.source?.format)).filter(Boolean);
  const refFormats = recentRefs.map((ref) => contentFormat(ref.format)).filter(Boolean);

  const formatCounts = new Map();
  for (const format of [...ownFormats, ...refFormats]) {
    formatCounts.set(format, (formatCounts.get(format) || 0) + 1);
  }

  const visual = buildTrendCreatives({ ownPosts: recentOwn, references: recentRefs });

  return {
    windowDays,
    generatedAt: Date.now(),
    ownPostCount: recentOwn.length,
    referenceCount: recentRefs.length,
    signals,
    formats: [...formatCounts.entries()]
      .map(([format, count]) => ({ format, count }))
      .sort((a, b) => b.count - a.count || a.format.localeCompare(b.format)),
    creatives: visual.creatives,
    mix: visual.mix,
    recommendedFormat: visual.recommendedFormat,
    limitations: [
      'own_and_references_only',
      'no_platform_explore',
      'no_invented_metrics',
    ],
  };
}

function deriveTrends(store, referenceStore, {
  projectId = 'default',
  windowDays = 30,
  language = 'es',
  database = null,
  radarStore = null,
} = {}) {
  const days = WINDOW_DAYS.has(Number(windowDays)) ? Number(windowDays) : 30;
  const metricByPost = new Map((store.listLatestMetrics?.() || []).map((row) => [row.postId, row]));
  const ownPosts = (store.listPosts({ projectId, limit: 400 }) || []).map((post) => ({
    ...post,
    metrics: post.metrics || metricByPost.get(post.id) || null,
  }));
  const references = (referenceStore.listReferences({ projectId, limit: 400 }) || []).map((row) => ({
    id: row.id,
    kind: row.kind,
    themes: Array.isArray(row.topics) ? row.topics : [],
    topics: Array.isArray(row.topics) ? row.topics : [],
    text: row.body,
    title: row.title,
    body: row.body,
    format: row.format,
    capturedAt: row.capturedAt,
    publishedAt: row.publishedAt,
    provider: row.provider,
    url: row.url,
    author: row.author,
    media: row.media,
    metrics: row.metrics,
  }));
  const snapshot = buildTrendSignals({ ownPosts, references, windowDays: days });
  const saved = referenceStore.saveTrendSnapshot({
    projectId,
    periodDays: days,
    payload: snapshot,
  });
  if (!database || !radarStore) {
    return { success: true, ...snapshot, snapshotId: saved?.id || null, feeds: emptyFeeds() };
  }
  return buildRadarFeeds({
    database,
    store,
    referenceStore,
    radarStore,
    projectId,
    windowDays: days,
    language,
  }).then((radar) => ({
    success: true,
    ...snapshot,
    ...radar,
    limitations: uniqueSorted([...(snapshot.limitations || []), ...(radar.limitations || [])]),
    snapshotId: saved?.id || null,
  }));
}

function emptyFeeds() {
  return { radar: [], forYou: [], emerging: [], popular: [] };
}

function createFromTrend(radarStore, cluster, { projectId = 'default' } = {}) {
  const enriched = cluster.creativeBrief ? cluster : enrichCluster(cluster, { affinity: cluster.affinity || 0 });
  const body = [...enriched.creativeBrief.angles, '', ...enriched.creativeBrief.structure].join('\n');
  const attribution = radarStore.createAttribution({ projectId, clusterId: cluster.id });
  radarStore.recordEvent({
    projectId,
    clusterId: cluster.id,
    eventType: 'generate',
    payload: { topics: cluster.topics || [cluster.title], topicKey: cluster.topicKey },
  });
  return {
    seed: {
      body,
      topics: (cluster.topics || []).slice(0, 6),
    },
    attribution,
  };
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function buildCompetitiveReport({ ownPosts, watchlist, references }) {
  const published = (ownPosts || []).filter((post) => post.status === 'published' || post.status === 'imported');
  const cited = (references || []).map((ref) => ({
    id: ref.id,
    title: ref.title || ref.author?.name || ref.provider,
    provider: ref.provider,
    format: ref.format,
    url: ref.url,
    topics: Array.isArray(ref.topics) ? ref.topics : [],
  }));
  return {
    success: true,
    reportType: 'competitive',
    watchlist: watchlist
      ? {
          id: watchlist.id,
          name: watchlist.name,
          kind: watchlist.kind,
          members: (watchlist.members || []).map((member) => ({
            displayName: member.displayName || member.handle || member.provider,
            handle: member.handle,
            provider: member.provider,
            profileUrl: member.profileUrl,
          })),
        }
      : null,
    own: {
      publishedCount: published.length,
      formats: countBy(published, (post) => post.format || post.source?.format),
      topics: countBy(published.flatMap((post) => post.topics || []), (topic) => String(topic)),
    },
    references: {
      count: cited.length,
      formats: countBy(cited, (ref) => ref.format),
      topics: countBy(cited.flatMap((ref) => ref.topics), (topic) => String(topic)),
      citations: cited.slice(0, 24),
    },
    limitations: [
      'Comparison uses your published posts and saved references only.',
      'Missing metrics are omitted, never filled with zeros.',
    ],
  };
}

function overlapTopics(left, right) {
  const rightSet = new Set(right);
  return left.filter((topic) => rightSet.has(topic));
}

function postFormat(post) {
  return post.format || post.source?.format || null;
}

function buildFitSuggestions({ ownPosts, references }) {
  const own = (ownPosts || []).filter((post) =>
    ['draft', 'scheduled', 'published', 'imported'].includes(post.status),
  );
  const refs = (references || []).filter((ref) => ref.format !== 'profile');
  const fits = [];
  for (const ref of refs.slice(0, 24)) {
    const refTopics = uniqueSorted([
      ...(Array.isArray(ref.topics) ? ref.topics : []),
      ...extractHashtags(ref.body || ref.title || ''),
    ]);
    const refFormat = ref.format || null;
    let best = null;
    for (const post of own) {
      const ownTopics = uniqueSorted([
        ...(post.topics || []),
        ...extractHashtags(post.body || post.caption || ''),
      ]);
      const overlap = overlapTopics(refTopics, ownTopics);
      const formatMatch = Boolean(refFormat && postFormat(post) === refFormat);
      const score = overlap.length * 2 + (formatMatch ? 3 : 0);
      if (score <= 0) continue;
      if (!best || score > best.score) {
        best = { post, score, overlap, formatMatch };
      }
    }
    if (!best) continue;
    fits.push({
      referenceId: ref.id,
      referenceTitle: ref.title || ref.author?.name || ref.provider,
      referenceHandle: ref.author?.handle || null,
      referenceUrl: ref.url,
      referenceFormat: refFormat,
      ownPostId: best.post.id,
      ownPostTitle: (best.post.body || best.post.title || '').slice(0, 80) || postFormat(best.post) || 'post',
      ownPostStatus: best.post.status,
      formatMatch: best.formatMatch,
      topics: best.overlap.slice(0, 4),
      score: best.score,
    });
  }
  return fits.sort((a, b) => b.score - a.score || a.referenceTitle.localeCompare(b.referenceTitle)).slice(0, 8);
}

function buildProfileComparison({ ownAccount, ownMetric, reference }) {
  if (!reference) return null;
  const theirsFollowers = reference.followers ?? null;
  const ownFollowers = ownMetric?.followers ?? null;
  return {
    own: ownAccount
      ? {
          name: ownAccount.displayName || ownAccount.handle || ownAccount.provider,
          handle: ownAccount.handle,
          provider: ownAccount.provider,
          followers: ownFollowers,
          postsCount: ownMetric?.postsCount ?? null,
        }
      : null,
    theirs: {
      name: reference.author?.name || reference.title,
      handle: reference.author?.handle || null,
      provider: reference.provider,
      followers: theirsFollowers,
      postsCount: reference.postsCount ?? null,
      following: reference.following ?? null,
    },
    notes: [
      ownFollowers == null || theirsFollowers == null
        ? 'Follower counts are compared only when both sides published a public number.'
        : null,
    ].filter(Boolean),
  };
}

module.exports = {
  deriveTrends,
  createFromTrend,
  buildTrendSignals,
  buildTrendCreatives,
  buildCompetitiveReport,
  buildFitSuggestions,
  buildProfileComparison,
  WINDOW_DAYS,
};
