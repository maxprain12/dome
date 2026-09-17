'use strict';

const crypto = require('node:crypto');

function parseJson(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function sameMetrics(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const keys = ['likes', 'comments', 'shares', 'impressions', 'saves'];
  return keys.every((key) => (a[key] ?? null) === (b[key] ?? null));
}

function metricFields(metrics) {
  const value = metrics && typeof metrics === 'object' ? metrics : {};
  return {
    likes: typeof value.likes === 'number' ? value.likes : null,
    comments: typeof value.comments === 'number' ? value.comments : null,
    shares: typeof value.shares === 'number' ? value.shares : null,
    impressions: typeof value.impressions === 'number' ? value.impressions : null,
    saves: typeof value.saves === 'number' ? value.saves : null,
  };
}

function createRadarStore(database) {
  const q = () => database.getQueries();

  function snapshotReferenceMetrics(referenceId, metrics, capturedAt = Date.now()) {
    if (!referenceId || !metrics || typeof metrics !== 'object') return null;
    const fields = metricFields(metrics);
    if (Object.values(fields).every((value) => value == null)) return null;
    const latest = q().getLatestSocialReferenceMetric.get(referenceId);
    if (latest && sameMetrics(metricFields(parseJson(latest.metrics_json, latest)), fields)) {
      return null;
    }
    const id = `srm-${crypto.randomBytes(8).toString('hex')}`;
    q().insertSocialReferenceMetric.run(
      id,
      referenceId,
      capturedAt,
      fields.likes,
      fields.comments,
      fields.shares,
      fields.impressions,
      fields.saves,
      JSON.stringify(metrics),
      Date.now(),
    );
    return id;
  }

  function listReferenceMetricSeries(referenceId, limit = 40) {
    return q().listSocialReferenceMetrics.all(referenceId, limit).map((row) => ({
      t: row.captured_at,
      capturedAt: row.captured_at,
      metrics: parseJson(row.metrics_json, {
        likes: row.likes,
        comments: row.comments,
        shares: row.shares,
        impressions: row.impressions,
        saves: row.saves,
      }),
    })).reverse();
  }

  function cacheClusters(projectId, feed, clusters, ttlMs = 30 * 60 * 1000) {
    const now = Date.now();
    const expiresAt = now + ttlMs;
    for (const cluster of clusters || []) {
      q().upsertSocialRadarClusterCache.run(
        cluster.id,
        projectId,
        feed,
        cluster.topicKey || cluster.id,
        JSON.stringify(cluster),
        expiresAt,
        now,
        now,
      );
    }
  }

  function listCachedClusters(projectId, feed) {
    q().deleteExpiredSocialRadarClusterCache.run(Date.now());
    return q().listSocialRadarClusterCache.all(projectId, feed, Date.now()).map((row) => ({
      ...parseJson(row.payload_json, {}),
      id: row.id,
      feed: row.feed,
    }));
  }

  function getCachedCluster(clusterId) {
    const row = q().getSocialRadarClusterCache.get(clusterId);
    return row ? { ...parseJson(row.payload_json, {}), id: row.id, feed: row.feed } : null;
  }

  function listInterest(projectId) {
    return q().listSocialInterestProfile.all(projectId).map((row) => ({
      topicKey: row.topic_key,
      weight: row.weight / 1000,
      evidence: parseJson(row.evidence_json, []),
      updatedAt: row.updated_at,
    }));
  }

  function upsertInterest(projectId, topicKey, weight, evidence = []) {
    const existing = q().getSocialInterestProfile.get(projectId, topicKey);
    const id = existing?.id || `sip-${crypto.randomBytes(8).toString('hex')}`;
    q().upsertSocialInterestProfile.run(
      id,
      projectId,
      topicKey,
      Math.round(clampWeight(weight) * 1000),
      JSON.stringify(evidence),
      Date.now(),
    );
  }

  function recordEvent({ projectId = 'default', clusterId = null, eventType, payload = {} }) {
    const id = `ste-${crypto.randomBytes(8).toString('hex')}`;
    q().insertSocialTrendEvent.run(
      id,
      projectId,
      clusterId,
      eventType,
      JSON.stringify(payload),
      Date.now(),
    );
    return id;
  }

  function listEvents(projectId, limit = 250) {
    return q().listSocialTrendEvents.all(projectId, limit).map((row) => ({
      id: row.id,
      clusterId: row.cluster_id,
      eventType: row.event_type,
      payload: parseJson(row.payload_json, {}),
      payloadJson: row.payload_json,
      createdAt: row.created_at,
    }));
  }

  function createAttribution({ projectId = 'default', clusterId, draftId = null, postId = null }) {
    const id = `sta-${crypto.randomBytes(8).toString('hex')}`;
    const now = Date.now();
    q().insertSocialTrendAttribution.run(id, projectId, clusterId, draftId, postId, now, now);
    return { id, projectId, clusterId, draftId, postId, createdAt: now };
  }

  function funnelSummary(projectId) {
    const events = listEvents(projectId, 1000);
    const counts = {};
    for (const event of events) {
      counts[event.eventType] = (counts[event.eventType] || 0) + 1;
    }
    return counts;
  }

  return {
    snapshotReferenceMetrics,
    listReferenceMetricSeries,
    cacheClusters,
    listCachedClusters,
    getCachedCluster,
    listInterest,
    upsertInterest,
    recordEvent,
    listEvents,
    createAttribution,
    funnelSummary,
  };
}

function clampWeight(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(-1, value));
}

module.exports = { createRadarStore, sameMetrics };
