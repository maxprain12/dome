'use strict';

/* eslint-disable no-console */

/**
 * Social insights — builds the analytics payload (account growth + per-post
 * performance + posting cadence) and generates AI growth reports through the
 * user's configured LLM provider (llm-service). Reports are persisted in
 * `social_reports` and surfaced in the Social hub → Reports section.
 */

const LANGUAGE_NAMES = { es: 'Spanish', en: 'English', fr: 'French', pt: 'Portuguese' };

const SYSTEM_PROMPT = [
  'You are a senior social media strategist and growth analyst.',
  'You receive a JSON snapshot of the user\'s social accounts (LinkedIn, Instagram, X):',
  'follower growth over time, per-post performance metrics, posting cadence and topics.',
  'Write an actionable growth report in Markdown with EXACTLY these sections:',
  '',
  '# <short report title with the period>',
  '## Resumen ejecutivo — 3-5 bullets with the most important takeaways.',
  '## Crecimiento de la cuenta — follower/engagement evolution per network; call out inflection points.',
  '## Qué está funcionando — top posts and WHY (topic, format, hook, timing). Cite concrete posts.',
  '## Qué no está funcionando — weak posts/patterns to drop, with evidence.',
  '## Recomendaciones de contenido — 5-8 concrete post ideas (network, angle, suggested hook) based on what worked.',
  '## Plan de enfoque — cadence, best posting windows from the data, topics to double down on for the next period.',
  '',
  'Rules: ground every claim in the provided data (quote numbers); if data is sparse, say so and',
  'give best-practice guidance clearly labeled as such; never invent metrics; keep it under 900 words.',
].join('\n');

function truncate(text, max) {
  const s = String(text || '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** Downsample a time series to at most `max` points, always keeping first/last. */
function downsample(points, max = 40) {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}

/** Growth series + deltas per account, renderer-friendly. */
function buildGrowth(store, { days = 90 } = {}) {
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const accounts = store.listAccounts();
  return accounts.map((account) => {
    const series = store.listAccountMetrics(account.id, sinceMs);
    const points = downsample(
      series
        .filter((m) => m.followers != null)
        .map((m) => ({ t: m.capturedAt, followers: m.followers })),
      60
    );
    const latest = store.getLatestAccountMetric(account.id);
    const first = points[0] || null;
    const last = points[points.length - 1] || null;
    const followersUnavailable =
      account.provider === 'linkedin' &&
      (account.accountKind || 'member') !== 'organization' &&
      (latest?.followers == null)
        ? 'linkedin_member'
        : null;
    return {
      accountId: account.id,
      provider: account.provider,
      accountKind: account.accountKind || 'member',
      displayName: account.displayName,
      handle: account.handle,
      status: account.status,
      latest,
      points,
      delta: first && last ? (last.followers ?? 0) - (first.followers ?? 0) : null,
      followersUnavailable,
    };
  });
}

/** Compact JSON payload for the LLM. */
function buildAnalysisData(store, { periodDays = 30 } = {}) {
  const sinceMs = Date.now() - periodDays * 24 * 60 * 60 * 1000;
  const growth = buildGrowth(store, { days: Math.max(periodDays, 90) }).map((g) => ({
    provider: g.provider,
    handle: g.handle || g.displayName,
    followersNow: g.latest?.followers ?? null,
    followingNow: g.latest?.following ?? null,
    postsTotal: g.latest?.postsCount ?? null,
    followersDelta: g.delta,
    series: g.points.map((p) => ({ date: new Date(p.t).toISOString().slice(0, 10), followers: p.followers })),
  }));

  const published = store.listRecentPublished({ sinceMs, limit: 200 });
  const posts = published.slice(0, 60).map((post) => {
    const m = store.getLatestMetric(post.id);
    const when = post.publishedAt ? new Date(post.publishedAt) : null;
    return {
      provider: post.provider,
      publishedAt: when ? when.toISOString() : null,
      weekday: when ? when.toLocaleDateString('en-US', { weekday: 'short' }) : null,
      hour: when ? when.getHours() : null,
      topics: post.topics,
      campaign: post.campaign,
      hasMedia: (post.media || []).length > 0,
      body: truncate(post.body, 280),
      metrics: m
        ? {
            impressions: m.impressions, likes: m.likes, comments: m.comments,
            shares: m.shares, saves: m.saves, clicks: m.clicks,
          }
        : null,
    };
  });

  const counts = store.countPostsByStatus();
  return {
    generatedAt: new Date().toISOString(),
    periodDays,
    accounts: growth,
    postCounts: counts,
    postsInPeriod: published.length,
    posts,
  };
}

/**
 * Generate an AI report. Creates the row synchronously (status `generating`)
 * and resolves once the LLM finishes; the caller broadcasts row updates.
 */
async function generateReport(database, store, { periodDays, language, trigger = 'user', onUpdate } = {}) {
  const config = store.getReportConfig();
  const days = periodDays || config.periodDays;
  const lang = language || config.language;

  const report = store.createReport({ trigger, periodDays: days });
  onUpdate?.(report);

  try {
    const data = buildAnalysisData(store, { periodDays: days });
    if (data.accounts.length === 0) {
      throw new Error('No social accounts connected — connect one in Settings → Social first.');
    }

    const { getAISettings } = require('../ai/ai-settings.cjs');
    const llmService = require('../ai/llm-service.cjs');
    const ai = await getAISettings(database);
    if (!ai.apiKey && ai.provider !== 'ollama') {
      throw new Error('No AI provider configured — set one up in Settings → AI.');
    }

    const languageName = LANGUAGE_NAMES[lang] || 'Spanish';
    const result = await llmService.chat({
      provider: ai.provider,
      model: ai.model,
      apiKey: ai.apiKey,
      baseUrl: ai.baseUrl,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Write the full report in ${languageName} (keep the section structure, translate headings).\n\nData:\n${JSON.stringify(data)}`,
        },
      ],
      options: { maxTokens: 4096, temperature: 0.4 },
    });

    const content = (result?.text || '').trim();
    if (!content) throw new Error('AI returned an empty report');
    const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim()
      || `Social report — last ${days} days`;

    const summary = {
      accounts: data.accounts.map((a) => ({
        provider: a.provider, handle: a.handle,
        followersNow: a.followersNow, followersDelta: a.followersDelta,
      })),
      postsInPeriod: data.postsInPeriod,
    };
    const ready = store.markReportReady(report.id, { title, content, model: ai.model || ai.provider, data: summary });
    onUpdate?.(ready);
    return ready;
  } catch (err) {
    console.error('[Social] report generation failed:', err.message);
    const failed = store.markReportFailed(report.id, err.message);
    onUpdate?.(failed);
    return failed;
  }
}

module.exports = { buildGrowth, buildAnalysisData, generateReport };
