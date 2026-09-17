'use strict';

const { clamp01, topicKey, DAY_MS } = require('./radar-score.cjs');

const EVENT_WEIGHTS = {
  impression: 0.02,
  open: 0.12,
  save: 0.35,
  dismiss: -0.45,
  generate: 0.55,
  publish: 0.7,
  post_performance: 0.8,
};

function decay(at, now, halfLifeDays = 21) {
  if (!Number.isFinite(at)) return 0;
  return Math.exp(-Math.LN2 * Math.max(0, now - at) / (halfLifeDays * DAY_MS));
}

function bump(map, key, amount) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + amount);
}

function topicsFromText(value) {
  if (Array.isArray(value)) return value.map((item) => topicKey(item)).filter(Boolean);
  return String(value || '')
    .split(/[\s,]+/)
    .map((item) => topicKey(item.replace(/^#/, '')))
    .filter((item) => item.length >= 2);
}

function buildAffinityProfile({
  events = [],
  ownPosts = [],
  references = [],
  explicitInterests = [],
  now = Date.now(),
} = {}) {
  const weights = new Map();
  for (const interest of explicitInterests) {
    bump(weights, topicKey(interest.topicKey || interest), 0.9 * (interest.weight || 1));
  }
  for (const post of ownPosts) {
    const engagement = Number(post.engagementScore);
    const boost = Number.isFinite(engagement) ? clamp01(engagement / (engagement + 400)) : 0.12;
    for (const topic of topicsFromText(post.topics || post.themes || post.body)) {
      bump(weights, topic, 0.25 * boost);
    }
  }
  for (const ref of references) {
    for (const topic of topicsFromText(ref.topics || ref.themes || ref.body)) {
      bump(weights, topic, 0.18);
    }
  }
  for (const event of events) {
    const weight = EVENT_WEIGHTS[event.eventType || event.event_type] ?? 0;
    const age = decay(event.createdAt || event.created_at, now);
    const topics = [
      ...(event.topics || []),
      event.topicKey,
      event.clusterId,
    ];
    try {
      const payload = typeof event.payloadJson === 'string' ? JSON.parse(event.payloadJson) : event.payload || {};
      topics.push(...(payload.topics || []), payload.topicKey, payload.title);
    } catch {
      // ignore malformed payload
    }
    for (const topic of topicsFromText(topics)) {
      bump(weights, topic, weight * age);
    }
  }
  const max = Math.max(0.0001, ...weights.values());
  const normalized = new Map();
  for (const [key, value] of weights) {
    normalized.set(key, clamp01(value / max));
  }
  return { weights: normalized, updatedAt: now };
}

function clusterAffinity(cluster, profile) {
  if (!profile?.weights) return 0;
  const keys = [
    topicKey(cluster.topicKey || cluster.title),
    ...(cluster.topics || []).map((item) => topicKey(item)),
  ].filter(Boolean);
  if (keys.length === 0) return 0;
  let total = 0;
  for (const key of keys) {
    total += profile.weights.get(key) || 0;
  }
  return clamp01(total / keys.length);
}

module.exports = {
  EVENT_WEIGHTS,
  buildAffinityProfile,
  clusterAffinity,
  decay,
  topicsFromText,
};
