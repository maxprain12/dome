'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(min, max, value) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clamp(0, 1, value);
}

function finiteNumbers(values) {
  return (values || []).filter((value) => Number.isFinite(value));
}

function median(values) {
  const sorted = finiteNumbers(values).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mad(values, med = median(values)) {
  if (med == null) return null;
  return median(finiteNumbers(values).map((value) => Math.abs(value - med)));
}

function robustZ(value, med, madValue) {
  if (!Number.isFinite(value) || med == null) return 0;
  const scale = madValue && madValue > 0 ? 1.4826 * madValue : 1;
  return (value - med) / scale;
}

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

function relativePerformance(value, baselineValues) {
  const baseline = finiteNumbers(baselineValues);
  if (!Number.isFinite(value) || baseline.length === 0) return 0;
  const med = median(baseline);
  const madValue = mad(baseline, med);
  return clamp01(sigmoid(robustZ(value, med, madValue) / 2));
}

function engagementValue(metrics) {
  if (!metrics || typeof metrics !== 'object') return null;
  const likes = typeof metrics.likes === 'number' ? metrics.likes : null;
  const comments = typeof metrics.comments === 'number' ? metrics.comments : null;
  const views = typeof metrics.impressions === 'number' ? metrics.impressions : null;
  if (likes == null && comments == null && views == null) return null;
  return (views || 0) + (likes || 0) * 12 + (comments || 0) * 20;
}

function seriesRate(points) {
  const sorted = (points || [])
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.v))
    .sort((a, b) => a.t - b.t);
  if (sorted.length < 2) return null;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const days = (last.t - first.t) / DAY_MS;
  if (days <= 0) return null;
  return (last.v - first.v) / days;
}

function velocityFromSeries(points, now = Date.now()) {
  const sorted = (points || [])
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.v))
    .sort((a, b) => a.t - b.t);
  if (sorted.length < 2) return 0;
  const recent = sorted.filter((point) => point.t >= now - DAY_MS);
  const previous = sorted.filter((point) => point.t >= now - 7 * DAY_MS && point.t < now - DAY_MS);
  const recentRate = seriesRate(recent.length >= 2 ? recent : sorted.slice(-2));
  const previousRate = seriesRate(previous);
  if (recentRate == null) return 0;
  const baseline = previousRate == null ? 0 : previousRate;
  return clamp(-1, 1, (recentRate - baseline) / (Math.abs(baseline) + 1));
}

function burstFromSeries(points, now = Date.now()) {
  const sorted = (points || [])
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.v))
    .sort((a, b) => a.t - b.t);
  if (sorted.length === 0) return 0;
  const last = sorted[sorted.length - 1];
  const baseline = median(sorted.filter((point) => point.t < now - 6 * 60 * 60 * 1000).map((point) => point.v));
  const spike = baseline == null || baseline <= 0
    ? last.v > 0 ? 0.4 : 0
    : clamp01((last.v - baseline) / (baseline + 1));
  const velocityBoost = clamp01((velocityFromSeries(sorted, now) + 1) / 2);
  return clamp01(0.65 * spike + 0.35 * velocityBoost);
}

function freshness(lastSeenAt, now = Date.now(), halfLifeMs = 36 * 60 * 60 * 1000) {
  if (!Number.isFinite(lastSeenAt) || lastSeenAt <= 0) return 0;
  const age = Math.max(0, now - lastSeenAt);
  return Math.exp(-Math.LN2 * age / halfLifeMs);
}

function breadth({ uniqueAuthors = 0, uniqueNetworks = 0, minAuthors = 3 } = {}) {
  const authorScore = clamp01(uniqueAuthors / Math.max(1, minAuthors));
  const networkScore = clamp01(uniqueNetworks / 3);
  return clamp01(0.75 * authorScore + 0.25 * networkScore);
}

function saturationFromVolume({ itemCount = 0, uniqueAuthors = 0, windowDays = 30 } = {}) {
  if (itemCount <= 0) return 0;
  const concentration = 1 - uniqueAuthors / itemCount;
  const volume = clamp01(itemCount / Math.max(2, windowDays * 2));
  return clamp01(0.6 * Math.max(0, concentration) + 0.4 * volume);
}

function phase({ burst = 0, velocity = 0, saturation = 0, freshness: fresh = 0 } = {}) {
  if (velocity < -0.15) return 'cooling';
  if (saturation > 0.72 && velocity <= 0.15) return 'peak';
  if (burst > 0.55 && velocity > 0.35 && saturation < 0.45 && fresh > 0.45) return 'emerging';
  if (velocity > 0.25 && burst > 0.35) return 'accelerating';
  if (saturation > 0.55) return 'peak';
  return 'emerging';
}

function confidence({ sampleSize = 0, seriesLength = 0, uniqueAuthors = 0, hasCloud = false } = {}) {
  return clamp01(
    0.35 * clamp01(sampleSize / 8)
    + 0.25 * clamp01(seriesLength / 4)
    + 0.25 * clamp01(uniqueAuthors / 5)
    + (hasCloud ? 0.15 : 0),
  );
}

function trendScore({
  relative = 0,
  velocity = 0,
  burst = 0,
  breadth: breadthScore = 0,
  quality = 0,
  freshness: fresh = 0,
} = {}) {
  const vel = (clamp(-1, 1, velocity) + 1) / 2;
  return clamp01(
    0.28 * clamp01(relative)
    + 0.18 * vel
    + 0.18 * clamp01(burst)
    + 0.16 * clamp01(breadthScore)
    + 0.1 * clamp01(quality)
    + 0.1 * clamp01(fresh),
  );
}

function novelty({ lastUsedAt = null, seenCount = 0, now = Date.now(), halfLifeDays = 14 } = {}) {
  const recency = lastUsedAt
    ? Math.exp(-Math.LN2 * Math.max(0, now - lastUsedAt) / (halfLifeDays * DAY_MS))
    : 0;
  const frequency = clamp01(seenCount / 8);
  return clamp01(1 - 0.6 * recency - 0.4 * frequency);
}

function feasibility({ networks = [], capabilities = {} } = {}) {
  if (!networks.length) return 0.7;
  const usable = networks.some((network) => {
    const cap = capabilities[network];
    return cap === 'native' || cap === 'own_only' || cap === 'cloud' || cap === 'poc';
  });
  return usable ? 1 : 0.7;
}

function forYouScore({
  trendScore: score = 0,
  affinity = 0,
  novelty: noveltyScore = 1,
  feasibility: feasibilityScore = 1,
} = {}) {
  return clamp01(clamp01(score) * (0.6 + 0.4 * clamp01(affinity)) * clamp01(noveltyScore) * clamp01(feasibilityScore));
}

function topicKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

function looksLikeOpaqueId(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) return true;
  if (/^(sr|sp|scamp|radar|cluster)-[0-9a-f]+$/i.test(text)) return true;
  return false;
}

function humanClusterTitle(raw, fallback = 'Untitled trend') {
  const text = String(raw || '').trim();
  if (!text || looksLikeOpaqueId(text)) return fallback;
  return text;
}

function stableClusterSort(a, b, scoreKey = 'trendScore') {
  const scoreDelta = (b[scoreKey] || 0) - (a[scoreKey] || 0);
  if (scoreDelta !== 0) return scoreDelta;
  const title = String(a.title || '').localeCompare(String(b.title || ''), 'en');
  if (title !== 0) return title;
  return String(a.id || '').localeCompare(String(b.id || ''), 'en');
}

module.exports = {
  DAY_MS,
  burstFromSeries,
  breadth,
  clamp,
  clamp01,
  confidence,
  engagementValue,
  feasibility,
  finiteNumbers,
  forYouScore,
  freshness,
  humanClusterTitle,
  looksLikeOpaqueId,
  mad,
  median,
  novelty,
  phase,
  relativePerformance,
  robustZ,
  saturationFromVolume,
  stableClusterSort,
  topicKey,
  trendScore,
  velocityFromSeries,
};
