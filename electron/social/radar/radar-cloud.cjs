'use strict';

const { z } = require('zod');
const { getDomeProviderBaseUrl } = require('../../ai/dome-provider-url.cjs');
const domeOauth = require('../../auth/dome-oauth.cjs');
const planGate = require('../../storage/plan-gate.cjs');
const { radarFlags } = require('./radar-flags.cjs');

const CloudClusterSchema = z.object({
  id: z.string().min(1),
  topicKey: z.string().min(1),
  title: z.string().min(1).max(180),
  summary: z.string().max(2000).nullable().optional(),
  phase: z.enum(['emerging', 'accelerating', 'peak', 'cooling']),
  confidence: z.number().min(0).max(1),
  saturation: z.number().min(0).max(1).optional(),
  trendScore: z.number().min(0).max(1),
  burst: z.number().min(0).max(1).optional(),
  velocity: z.number().min(-1).max(1).optional(),
  breadth: z.number().min(0).max(1).optional(),
  freshness: z.number().min(0).max(1).optional(),
  networks: z.array(z.string()).optional(),
  authorCount: z.number().int().nonnegative().optional(),
  postCount: z.number().int().nonnegative().optional(),
  evidence: z.array(z.object({
    id: z.string().min(1),
    origin: z.string().optional(),
    provider: z.string().nullable().optional(),
    title: z.string().min(1),
    url: z.string().nullable().optional(),
    author: z.object({
      name: z.string().nullable().optional(),
      handle: z.string().nullable().optional(),
    }).optional(),
  })).optional(),
  contentPatterns: z.array(z.string()).optional(),
  nativeTrend: z.boolean().optional(),
  limitations: z.array(z.string()).optional(),
  topics: z.array(z.string()).optional(),
  source: z.literal('cloud').optional(),
});

const CloudFeedSchema = z.object({
  generatedAt: z.number().optional(),
  capabilities: z.record(z.string(), z.string()).optional(),
  budget: z.object({
    provider: z.string(),
    remaining: z.number(),
    exhausted: z.boolean(),
    reason: z.string().nullable().optional(),
  }).nullable().optional(),
  clusters: z.array(CloudClusterSchema),
  limitations: z.array(z.string()).optional(),
});

async function fetchCloudTrends(database, { topics = [], lang = 'es', market = null } = {}) {
  const flags = radarFlags(database);
  if (!flags.cloudEnabled) {
    return { ok: false, reason: 'flag_disabled', clusters: [], budget: null, capabilities: null };
  }
  const entitlements = await planGate.getEntitlements(database);
  if (!entitlements?.entitlements?.hasSocialCloud) {
    return { ok: false, reason: 'social_cloud_unavailable', clusters: [], budget: null, capabilities: null };
  }
  const session = await domeOauth.getOrRefreshSession(database);
  if (!session.connected) {
    return { ok: false, reason: 'offline', clusters: [], budget: null, capabilities: null };
  }
  const base = getDomeProviderBaseUrl().replace(/\/$/, '');
  const params = new URLSearchParams();
  if (topics.length > 0) params.set('topics', topics.slice(0, 12).join(','));
  if (lang) params.set('lang', lang);
  if (market) params.set('market', market);
  const url = `${base}/api/v1/social/trends${params.size ? `?${params}` : ''}`;
  try {
    const res = await domeOauth.fetchWithDomeAuth(database, url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: 'permissions', clusters: [], budget: null, capabilities: null };
    }
    if (res.status === 429) {
      return { ok: false, reason: 'budget_exhausted', clusters: [], budget: { exhausted: true, remaining: 0, provider: 'x' }, capabilities: null };
    }
    if (!res.ok) {
      return { ok: false, reason: `http_${res.status}`, clusters: [], budget: null, capabilities: null };
    }
    const parsed = CloudFeedSchema.safeParse(await res.json());
    if (!parsed.success) {
      return { ok: false, reason: 'invalid_payload', clusters: [], budget: null, capabilities: null };
    }
    return {
      ok: true,
      reason: null,
      clusters: parsed.data.clusters.map((cluster) => ({ ...cluster, source: 'cloud' })),
      budget: parsed.data.budget || null,
      capabilities: parsed.data.capabilities || null,
      limitations: parsed.data.limitations || [],
    };
  } catch (err) {
    const message = String(err?.message || err);
    const reason = /not connected/i.test(message) ? 'offline' : 'unreachable';
    return { ok: false, reason, clusters: [], budget: null, capabilities: null };
  }
}

async function fetchCloudCapabilities(database) {
  const flags = radarFlags(database);
  if (!flags.cloudEnabled) {
    return { x: 'unavailable', instagram: flags.instagramPoc ? 'poc' : 'own_only', linkedin: 'own_only' };
  }
  try {
    const entitlements = await planGate.getEntitlements(database);
    if (!entitlements?.entitlements?.hasSocialCloud) {
      return { x: 'unavailable', instagram: flags.instagramPoc ? 'poc' : 'own_only', linkedin: 'own_only' };
    }
    const base = getDomeProviderBaseUrl().replace(/\/$/, '');
    const res = await domeOauth.fetchWithDomeAuth(database, `${base}/api/v1/social/trends/capabilities`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return { x: 'unavailable', instagram: flags.instagramPoc ? 'poc' : 'own_only', linkedin: 'own_only' };
    }
    const data = await res.json();
    return {
      x: data.x || 'unavailable',
      instagram: flags.instagramPoc ? (data.instagram || 'poc') : 'own_only',
      linkedin: data.linkedin || 'own_only',
      budget: data.budget || null,
    };
  } catch {
    return { x: 'unavailable', instagram: flags.instagramPoc ? 'poc' : 'own_only', linkedin: 'own_only' };
  }
}

module.exports = {
  CloudFeedSchema,
  fetchCloudCapabilities,
  fetchCloudTrends,
};
