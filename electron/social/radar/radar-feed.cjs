'use strict';

const {
  engagementValue,
  feasibility,
  forYouScore,
  novelty,
  stableClusterSort,
} = require('./radar-score.cjs');
const { clusterItems, mergeClusters } = require('./radar-cluster.cjs');
const { buildAffinityProfile, clusterAffinity } = require('./radar-affinity.cjs');
const { mmrRerank } = require('./radar-mmr.cjs');
const { enrichClusters } = require('./radar-enrich.cjs');
const { platformCapabilities, radarFlags } = require('./radar-flags.cjs');
const { fetchCloudCapabilities, fetchCloudTrends } = require('./radar-cloud.cjs');

const WINDOW_DAYS = new Set([7, 30, 90]);
const MIN_BREADTH_GLOBAL = 3;

function splitFeeds(clusters) {
  const radar = clusters
    .filter((cluster) => cluster.source === 'local' || cluster.source === 'hybrid')
    .slice()
    .sort((a, b) => stableClusterSort(a, b, 'trendScore'));
  const emerging = clusters
    .filter((cluster) => (
      (cluster.phase === 'emerging' || cluster.phase === 'accelerating')
      && cluster.authorCount >= 2
      && (cluster.nativeTrend || cluster.authorCount >= MIN_BREADTH_GLOBAL || cluster.source !== 'local')
    ))
    .slice()
    .sort((a, b) => stableClusterSort(a, b, 'burst'));
  const popular = clusters
    .filter((cluster) => (
      cluster.phase === 'peak'
      && cluster.authorCount >= MIN_BREADTH_GLOBAL
      && cluster.trendScore >= 0.45
    ))
    .slice()
    .sort((a, b) => stableClusterSort(a, b, 'trendScore'));
  const forYou = mmrRerank(
    clusters.filter((cluster) => cluster.forYouScore > 0).slice().sort((a, b) => stableClusterSort(a, b, 'forYouScore')),
    { lambda: 0.7, limit: 12, scoreKey: 'forYouScore' },
  );
  return { radar: radar.slice(0, 18), emerging: emerging.slice(0, 12), popular: popular.slice(0, 12), forYou };
}

function attachPersonalization(clusters, profile, capabilities, events, now) {
  const used = new Map();
  for (const event of events || []) {
    if (event.eventType === 'generate' || event.eventType === 'publish') {
      used.set(event.clusterId, (used.get(event.clusterId) || 0) + 1);
    }
  }
  const lastUsed = new Map();
  for (const event of events || []) {
    if (!lastUsed.has(event.clusterId)) lastUsed.set(event.clusterId, event.createdAt);
  }
  return clusters.map((cluster) => {
    const affinity = clusterAffinity(cluster, profile);
    const noveltyScore = novelty({
      lastUsedAt: lastUsed.get(cluster.id) || null,
      seenCount: used.get(cluster.id) || 0,
      now,
    });
    const feasible = feasibility({ networks: cluster.networks, capabilities });
    const personalized = {
      ...cluster,
      affinity,
      novelty: noveltyScore,
      feasibility: feasible,
      forYouScore: forYouScore({
        trendScore: cluster.trendScore,
        affinity,
        novelty: noveltyScore,
        feasibility: feasible,
      }),
    };
    return personalized;
  });
}

async function buildRadarFeeds({
  database,
  store,
  referenceStore,
  radarStore,
  projectId = 'default',
  windowDays = 30,
  language = 'es',
} = {}) {
  const days = WINDOW_DAYS.has(Number(windowDays)) ? Number(windowDays) : 30;
  const now = Date.now();
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  const flags = radarFlags(database);
  const metricByPost = new Map((store.listLatestMetrics?.() || []).map((row) => [row.postId, row]));
  const ownPosts = (store.listPosts({ projectId, limit: 400 }) || [])
    .map((post) => ({
      ...post,
      origin: 'own',
      metrics: post.metrics || metricByPost.get(post.id) || null,
      metricSeries: (store.listMetricsForPost?.(post.id) || []).map((row) => ({
        t: row.capturedAt,
        metrics: row,
      })),
    }))
    .filter((post) => (post.publishedAt || post.createdAt || 0) >= cutoff);

  const references = (referenceStore.listReferences({ projectId, limit: 400 }) || []).map((row) => ({
    ...row,
    origin: 'reference',
    themes: Array.isArray(row.topics) ? row.topics : [],
    text: row.body,
    metricSeries: radarStore.listReferenceMetricSeries(row.id),
  })).filter((row) => (row.capturedAt || 0) >= cutoff);

  const localItems = [
    ...ownPosts.filter((post) => ['published', 'imported'].includes(post.status)),
    ...references.filter((row) => row.kind !== 'profile'),
  ].map((item) => ({
    ...item,
    engagementScore: engagementValue(item.metrics),
  }));

  const localClusters = clusterItems(localItems, {
    now,
    windowDays: days,
    source: 'local',
    hasCloud: false,
  });

  const activeTopics = localClusters
    .slice()
    .sort((a, b) => stableClusterSort(a, b, 'trendScore'))
    .map((cluster) => cluster.topicKey)
    .slice(0, 8);

  const cloud = await fetchCloudTrends(database, { topics: activeTopics, lang: language });
  const cloudCaps = cloud.capabilities || await fetchCloudCapabilities(database);
  const merged = mergeClusters(localClusters, cloud.ok ? cloud.clusters : []);
  const events = radarStore.listEvents(projectId);
  const profile = buildAffinityProfile({
    events,
    ownPosts: localItems.filter((item) => item.origin === 'own'),
    references,
    explicitInterests: radarStore.listInterest(projectId),
    now,
  });
  const capabilities = platformCapabilities({
    connected: cloud.reason !== 'offline',
    hasSocialCloud: cloud.ok || cloud.reason !== 'social_cloud_unavailable',
    flags,
  });
  const personalized = attachPersonalization(merged, profile, { ...capabilities, ...(cloudCaps || {}) }, events, now);
  const affinityById = new Map(personalized.map((cluster) => [cluster.id, cluster.affinity]));
  const enriched = enrichClusters(personalized, {
    affinityById,
    language,
    topN: flags.enrichTopN,
  });
  const feeds = splitFeeds(enriched);

  radarStore.cacheClusters(projectId, 'radar', feeds.radar);
  radarStore.cacheClusters(projectId, 'forYou', feeds.forYou);
  radarStore.cacheClusters(projectId, 'emerging', feeds.emerging);
  radarStore.cacheClusters(projectId, 'popular', feeds.popular);

  const limitations = [
    'own_and_references_only',
    'no_invented_metrics',
    cloud.ok ? null : 'no_platform_explore',
    cloud.ok ? null : cloud.reason,
    feeds.emerging.length === 0 ? 'insufficient_temporal_evidence' : null,
  ].filter(Boolean);

  return {
    generatedAt: now,
    windowDays: days,
    ownPostCount: ownPosts.filter((post) => ['published', 'imported'].includes(post.status)).length,
    referenceCount: references.length,
    limitations,
    capabilities: {
      x: cloudCaps?.x || capabilities.x,
      instagram: capabilities.instagram,
      linkedin: capabilities.linkedin,
    },
    budget: cloud.budget,
    cloudStatus: cloud.ok ? 'ok' : cloud.reason,
    feeds,
    claims: [...feeds.forYou, ...feeds.radar].slice(0, 8).map((cluster) => ({
      id: cluster.id,
      title: cluster.title,
      phase: cluster.phase,
      trendScore: cluster.trendScore,
      affinity: cluster.affinity,
      confidence: cluster.confidence,
      nativeTrend: Boolean(cluster.nativeTrend),
      whyNow: cluster.whyNow,
      whyForYou: cluster.whyForYou,
      evidence: (cluster.evidence || []).map((item) => ({
        id: item.id,
        title: item.title,
        url: item.url,
        origin: item.origin,
        author: item.author?.name || item.author?.handle || null,
      })),
      limitations: cluster.limitations || [],
    })),
  };
}

module.exports = {
  attachPersonalization,
  buildRadarFeeds,
  splitFeeds,
  WINDOW_DAYS,
};
