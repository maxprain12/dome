'use strict';

const crypto = require('node:crypto');
const {
  burstFromSeries,
  breadth,
  clamp01,
  confidence,
  engagementValue,
  freshness,
  humanClusterTitle,
  phase,
  relativePerformance,
  saturationFromVolume,
  topicKey,
  trendScore,
  velocityFromSeries,
} = require('./radar-score.cjs');

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

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function contentFingerprint(item) {
  const url = String(item.url || item.externalUrl || '').split('?')[0];
  if (url) return `url:${url}`;
  const text = normalizeText(item.body || item.text || item.title || '');
  if (!text) return `id:${item.id || crypto.randomBytes(4).toString('hex')}`;
  return `text:${crypto.createHash('sha1').update(text).digest('hex').slice(0, 16)}`;
}

function dedupeItems(items) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const fp = contentFingerprint(item);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(item);
  }
  return out;
}

function itemTopics(item) {
  return uniqueSorted([
    ...parseThemes(item.topics || item.themes),
    ...extractHashtags(item.body || item.text || item.caption || item.title || ''),
  ]);
}

function authorKey(item) {
  const handle = String(item.author?.handle || item.handle || '').replace(/^@/, '').toLowerCase();
  if (handle) return handle;
  const name = String(item.author?.name || item.title || '').trim().toLowerCase();
  return name || item.provider || 'unknown';
}

function asEvidence(item) {
  const media = Array.isArray(item.media) ? item.media.filter(Boolean) : [];
  return {
    id: item.id || contentFingerprint(item),
    origin: item.origin || item.kind || 'reference',
    provider: item.provider || null,
    title: humanClusterTitle(item.title || item.body || item.text, item.author?.name || item.provider || 'Untitled'),
    url: item.url || item.externalUrl || null,
    author: {
      name: item.author?.name || item.title || item.provider || null,
      handle: item.author?.handle || null,
      avatarUrl: item.author?.avatarUrl || null,
    },
    format: item.format || null,
    media,
    metrics: item.metrics || null,
    publishedAt: item.publishedAt || item.capturedAt || null,
  };
}

function metricSeries(item) {
  const series = Array.isArray(item.metricSeries) ? item.metricSeries : [];
  if (series.length > 0) {
    return series
      .map((point) => ({ t: point.t || point.capturedAt, v: engagementValue(point.metrics || point) }))
      .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.v));
  }
  const value = engagementValue(item.metrics);
  const at = item.publishedAt || item.capturedAt;
  if (value == null || !Number.isFinite(at)) return [];
  return [{ t: at, v: value }];
}

function clusterItems(items, { now = Date.now(), windowDays = 30, source = 'local', hasCloud = false } = {}) {
  const groups = new Map();
  for (const item of dedupeItems(items)) {
    const topics = itemTopics(item);
    const keys = topics.length > 0 ? topics.map((topic) => topicKey(topic)) : ['untagged'];
    for (const key of keys) {
      const group = groups.get(key) || [];
      group.push(item);
      groups.set(key, group);
    }
  }

  const allEngagement = items
    .map((item) => engagementValue(item.metrics))
    .filter((value) => value != null);

  const clusters = [];
  for (const [key, group] of groups) {
    const authors = new Set(group.map((item) => authorKey(item)));
    const networks = new Set(group.map((item) => item.provider).filter(Boolean));
    const series = group.flatMap((item) => metricSeries(item)).sort((a, b) => a.t - b.t);
    const lastSeen = Math.max(...group.map((item) => item.publishedAt || item.capturedAt || 0), 0);
    const rel = relativePerformance(
      medianOrZero(group.map((item) => engagementValue(item.metrics))),
      allEngagement,
    );
    const vel = velocityFromSeries(series, now);
    const burst = burstFromSeries(series, now);
    const breadthScore = breadth({ uniqueAuthors: authors.size, uniqueNetworks: networks.size });
    const sat = saturationFromVolume({
      itemCount: group.length,
      uniqueAuthors: authors.size,
      windowDays,
    });
    const fresh = freshness(lastSeen, now);
    const quality = allEngagement.length === 0 ? 0.4 : rel;
    const score = trendScore({
      relative: rel,
      velocity: vel,
      burst,
      breadth: breadthScore,
      quality,
      freshness: fresh,
    });
    const titleSource = key === 'untagged'
      ? group[0]?.title || group[0]?.format || 'Untitled trend'
      : key.startsWith('#') ? key : group.find((item) => itemTopics(item)[0]) ? key : key;
    const nativeTrend = source === 'cloud' && authors.size >= 3 && series.length >= 2;
    clusters.push({
      id: `radar:${source}:${key}`,
      topicKey: key,
      title: humanClusterTitle(titleSource.startsWith('#') ? titleSource : `#${titleSource}`.replace(/^##/, '#'), 'Untitled trend'),
      summary: null,
      whyNow: null,
      whyForYou: null,
      phase: phase({ burst, velocity: vel, saturation: sat, freshness: fresh }),
      confidence: confidence({
        sampleSize: group.length,
        seriesLength: series.length,
        uniqueAuthors: authors.size,
        hasCloud,
      }),
      saturation: sat,
      trendScore: score,
      affinity: 0,
      forYouScore: score,
      burst,
      velocity: vel,
      breadth: breadthScore,
      quality,
      freshness: fresh,
      networks: [...networks].sort((a, b) => a.localeCompare(b)),
      authorCount: authors.size,
      postCount: group.length,
      evidence: group.slice(0, 6).map(asEvidence),
      contentPatterns: uniqueSorted(group.map((item) => item.format).filter(Boolean)).slice(0, 4),
      source,
      nativeTrend,
      topics: uniqueSorted(group.flatMap((item) => itemTopics(item))).slice(0, 8),
      limitations: [
        source === 'local' ? 'own_and_references_only' : null,
        series.length < 2 ? 'insufficient_temporal_evidence' : null,
        authors.size < 3 ? 'insufficient_breadth' : null,
        !nativeTrend ? 'no_platform_explore' : null,
      ].filter(Boolean),
    });
  }
  return clusters;
}

function medianOrZero(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return 0;
  const sorted = finite.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mergeClusters(localClusters, cloudClusters) {
  const byKey = new Map();
  for (const cluster of [...(localClusters || []), ...(cloudClusters || [])]) {
    const existing = byKey.get(cluster.topicKey);
    if (!existing) {
      byKey.set(cluster.topicKey, { ...cluster });
      continue;
    }
    const hybrid = {
      ...existing,
      ...cluster,
      id: existing.source === 'cloud' ? existing.id : cluster.id,
      source: existing.source === cluster.source ? existing.source : 'hybrid',
      trendScore: Math.max(existing.trendScore || 0, cluster.trendScore || 0),
      burst: Math.max(existing.burst || 0, cluster.burst || 0),
      velocity: Math.abs(cluster.velocity || 0) > Math.abs(existing.velocity || 0)
        ? cluster.velocity
        : existing.velocity,
      breadth: Math.max(existing.breadth || 0, cluster.breadth || 0),
      authorCount: Math.max(existing.authorCount || 0, cluster.authorCount || 0),
      postCount: (existing.postCount || 0) + (cluster.postCount || 0),
      evidence: [...(existing.evidence || []), ...(cluster.evidence || [])]
        .filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index)
        .slice(0, 8),
      networks: uniqueSorted([...(existing.networks || []), ...(cluster.networks || [])]),
      nativeTrend: Boolean(existing.nativeTrend || cluster.nativeTrend),
      limitations: uniqueSorted(
        [...(existing.limitations || []), ...(cluster.limitations || [])]
          .filter((code) => code !== 'own_and_references_only' || cluster.source === 'local'),
      ),
    };
    byKey.set(cluster.topicKey, hybrid);
  }
  return [...byKey.values()];
}

module.exports = {
  asEvidence,
  clusterItems,
  contentFingerprint,
  dedupeItems,
  extractHashtags,
  itemTopics,
  mergeClusters,
  parseThemes,
};
