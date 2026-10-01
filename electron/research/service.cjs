
'use strict';
const crypto = require('node:crypto');
const { Input } = require('./schemas.cjs');
const { capabilities, channel } = require('./catalog.cjs');
const budget = require('./budget.cjs');
const { evidence, markdown } = require('./evidence.cjs');
const { parseFeed } = require('./rss.cjs');
const { assertPublicUrl, fetchPublicWithTimeout } = require('../services/web/url-guard.cjs');
const { normalizeFetchRequest, normalizeSearchRequest } = require('../services/web/http-utils.cjs');
const { readSettingSecret } = require('../core/settings-secrets.cjs');

function createResearchService({ queries, browser, resolveSocial, saveResource, fetchPage, searchProviders, githubFetch, validateUrl = assertPublicUrl, freeSearch = require('../services/web/free-search.cjs').search }) {
  const jobs = new Map();
  const restrictedHosts = ['linkedin.com','reddit.com','facebook.com','youtube.com','youtu.be','bilibili.com','xiaohongshu.com','zhipin.com','xueqiu.com','xiaoyuzhoufm.com'];
  const validateTarget = (url) => {
    const host = new URL(url).hostname;
    if (restrictedHosts.some((domain) => host === domain || host.endsWith(`.${domain}`))) throw new Error('source_pending_enablement');
  };
  const keyNames = { brave: 'web_search_brave_key', tavily: 'web_search_tavily_key', exa: 'web_search_exa_api_key' };
  const providerKey = (name) => readSettingSecret(queries, keyNames[name]);
  function safeError(error) {
    let message = String(error.message || 'research_failed');
    for (const name of Object.keys(keyNames)) { const key = providerKey(name); if (key) message = message.split(key).join('[redacted]'); }
    return message.replace(/Bearer\s+[A-Za-z0-9._~+\/=-]+/gi, 'Bearer [redacted]').slice(0, 500);
  }
  function status() {
    return { success: true, channels: capabilities({ browser: browser?.status() || null,
      enabledProviders: budget.policy(queries).enabledProviders,
      configuredProviders: Object.keys(keyNames).filter((name) => providerKey(name)),
    }), policy: budget.policy(queries), usage: budget.ledger(queries), pricingAsOf: '2026-10-01',
    jobs: [...jobs.values()].map(({ job }) => ({ id: job.id, status: job.status, projectId: job.projectId, evidenceCount: job.evidence.length })),
    lastJob: queries.getSetting.get('research_last_job_v1')?.value ? JSON.parse(queries.getSetting.get('research_last_job_v1').value) : null,
    excludes: ['llm', 'embeddings'], estimationOnly: true };
  }
  async function search(input, ctx) {
    if (!input.query) throw new Error('query_required');
    if (!['web', 'exa_search', 'github'].includes(input.platform)) throw new Error('search_pending_enablement');
    if (input.platform === 'github') {
      const data = await githubFetch(`/search/repositories?q=${encodeURIComponent(input.query)}&per_page=${input.count}`, ctx.signal);
      return { success: true, evidence: (data.items || []).map((item) => evidence({ platform: 'github', url: item.html_url,
        title: item.full_name, text: item.description, method: 'github_api', limitations: ['search_excerpt'] })) };
    }
    const provider = input.platform === 'exa_search' ? 'exa' : budget.policy(queries).enabledProviders.find((name) => providerKey(name));
    if (!provider && input.platform === 'web') {
      const request = { ...normalizeSearchRequest(input), signal: ctx.signal };
      const result = await freeSearch(request);
      return { success: true, cost: { estimatedUsd: 0 }, evidence: result.results.map((item) => evidence({ platform: 'web', url: item.url, title: item.title, text: item.description, method: result.provider, limitations: ['search_excerpt'] })) };
    }
    if (!provider || !providerKey(provider)) throw new Error('configure_and_enable_search_provider');
    ctx.signal?.throwIfAborted();
    const cost = budget.reserve(queries, ctx.runId, provider);
    const result = await searchProviders[provider]({ ...normalizeSearchRequest(input), signal: ctx.signal }, providerKey(provider));
    ctx.signal?.throwIfAborted();
    return { success: true, cost, evidence: result.results.map((item) => evidence({ platform: 'web', url: item.url,
      title: item.title, text: item.description, method: provider, limitations: ['search_excerpt'] })) };
  }
  async function read(input, ctx) {
    if (!input.url) throw new Error('url_required');
    const target = new URL(input.url);
    if (target.username || target.password) throw new Error('credential_url_not_allowed');
    validateTarget(input.url);
    ctx = { ...ctx, signal: ctx.signal ? AbortSignal.any([ctx.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) };
    await validateUrl(input.url);
    ctx.signal?.throwIfAborted();
    const selected = channel(input.platform);
    if (!selected?.operations.includes('read')) throw new Error('source_pending_enablement');
    if (input.source === 'browser') {
      if (input.platform !== 'web') throw new Error('browser_platform_pending_enablement');
      const result = await browser.read(target.href, ctx.signal);
      if (!result.success) return result;
      return { success: true, evidence: [evidence({ platform: input.platform, url: result.data.url,
        title: result.data.title, text: result.data.readableText, method: 'user_browser', limitations: result.data.limitations || [] })] };
    }
    if (input.platform === 'rss') {
      const response = await fetchPublicWithTimeout(input.url, { signal: ctx.signal }, 15000, validateTarget);
      if (!response.ok) throw new Error(`feed_http_${response.status}`);
      const reader = response.body.getReader();
      const chunks = []; let bytes = 0;
      try {
        for (;;) {
          ctx.signal?.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (bytes > 2_000_000) throw new Error('oversized_feed');
          chunks.push(Buffer.from(value));
        }
      } finally { await reader.cancel(); }
      return { success: true, evidence: parseFeed(Buffer.concat(chunks).toString('utf8'), input.url) };
    }
    if (['instagram', 'x'].includes(input.platform)) {
      const result = await resolveSocial(input.url, ctx.signal);
      if (!result.card || result.card.provider !== input.platform) throw new Error('profile_platform_mismatch');
      const card = result.card;
      const posts = [card, ...(card.recentPosts || []).slice(0, 50)];
      return { success: true, evidence: posts.map((post) => evidence({ platform: input.platform,
        url: post.url, title: post.author?.name, text: post.body, publishedAt: post.publishedAt,
        identity: { name: post.author?.name || null, handle: post.author?.handle || null },
        metrics: post.kind === 'profile' ? { followers: post.followers ?? null, following: post.following ?? null, posts: post.postsCount ?? null } : post.metrics || null, method: post.fetchMethod || card.fetchMethod,
        limitations: [...(post.limitations || []), 'partial_history'] })) };
    }
    if (input.platform === 'github') {
      const url = new URL(input.url);
      if (url.hostname !== 'github.com') throw new Error('github_url_required');
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length < 1 || parts.length > 2 || parts.some((part) => !/^[A-Za-z0-9_.-]+$/.test(part))) throw new Error('github_profile_or_repo_required');
      const path = parts.length === 2 ? `/repos/${parts.join('/')}` : `/users/${parts[0]}`;
      const data = await githubFetch(path, ctx.signal);
      return { success: true, evidence: [evidence({ platform: 'github', url: data.html_url,
        title: data.full_name || data.login, text: data.description || data.bio, method: 'github_api' })] };
    }
    const page = await fetchPage({ ...normalizeFetchRequest(input.url), signal: ctx.signal, maxBytes: 2_000_000, validateTarget });
    if (!page.success) throw new Error('page_capture_failed');
    ctx.signal?.throwIfAborted();
    return { success: true, evidence: [evidence({ platform: 'web', url: page.finalUrl || input.url,
      title: page.title, text: page.content, method: 'readability', limitations: ['partial_document'] })] };
  }
  async function collect(input, ctx) {
    if ([...jobs.values()].filter((entry) => entry.job.status === 'running').length >= 10) throw new Error('research_busy');
    const id = crypto.randomUUID();
    ctx = { ...ctx, runId: id };
    const controller = new AbortController();
    const abort = () => controller.abort();
    ctx.signal?.addEventListener('abort', abort, { once: true });
    if (ctx.signal?.aborted) controller.abort();
    const job = { id, projectId: ctx.projectId, status: 'running', evidence: [], failures: [], startedAt: Date.now() };
    jobs.set(id, { job, controller });
    if (jobs.size > 100) {
      const finished = [...jobs].find(([, value]) => value.job.status !== 'running');
      if (finished) jobs.delete(finished[0]);
    }
    try {
      let urls = input.urls || (input.url ? [input.url] : []);
      if (input.query) {
        const found = await search(input, { ...ctx, signal: controller.signal });
        job.evidence.push(...found.evidence);
        urls = [...new Set([...urls, ...found.evidence.map((item) => item.url)])].slice(0, 30);
      }
      if (!urls.length) throw new Error('urls_or_query_required');
      for (const url of urls.slice(0, 30)) {
        controller.signal.throwIfAborted();
        try {
          const result = await read({ ...input, platform: ['exa_search', 'github'].includes(input.platform) && input.query ? (input.platform === 'github' ? 'github' : 'web') : input.platform, url }, { ...ctx, signal: controller.signal });
          if (result.success === false) { job.failures.push({ url, error: result.status || result.error }); continue; }
          for (const item of result.evidence) {
            const index = job.evidence.findIndex((saved) => saved.id === item.id);
            if (index >= 0) job.evidence[index] = item;
            else if (job.evidence.length < 30) job.evidence.push(item);
            else job.limitations = ['evidence_limit_30'];
          }
        } catch (error) {
          controller.signal.throwIfAborted();
          job.failures.push({ url, error: safeError(error) });
        }
      }
      controller.signal.throwIfAborted();
      job.status = !job.evidence.length && job.failures.some((failure) => failure.error === 'requires_connection') ? 'requires_connection' : job.failures.length ? 'partial' : 'completed';
      if (input.save && job.evidence.length) {
        const saved = await saveResource({ project_id: ctx.projectId, title: input.title || input.query || 'Research evidence',
          type: 'note', content: markdown(job.evidence), metadata: { researchJobId: id, evidence: job.evidence, coverage: 'partial' } });
        if (!saved.success) throw new Error('evidence_save_failed');
        job.resourceId = saved.resource.id;
      }
    } catch (error) {
      job.status = controller.signal.aborted ? 'cancelled' : 'failed';
      job.error = controller.signal.aborted ? 'cancelled' : safeError(error);
    } finally {
      job.finishedAt = Date.now();
      queries.setSetting.run('research_last_job_v1', JSON.stringify({ id, status: job.status, projectId: job.projectId, resourceId: job.resourceId || null, savedEvidence: job.evidence.length, failures: job.failures.length, finishedAt: job.finishedAt }), Date.now());
      ctx.signal?.removeEventListener('abort', abort);
    }
    return { success: ['completed', 'partial'].includes(job.status), ...job };
  }
  async function execute(name, raw, context = {}) {
    try {
      if (name === 'research_capabilities') return status();
      const input = Input.parse(raw || {});
      const ctx = { signal: context.signal ? AbortSignal.any([context.signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000), runId: context.threadId || context.runId || 'desktop',
        projectId: context.automationProjectId || context.projectId || input.project_id || 'default' };
      if (name === 'research_search') return await search(input, ctx);
      if (name === 'research_collect') return await collect(input, ctx);
      if (name === 'research_profile' && !['github', 'instagram', 'x'].includes(input.platform)) throw new Error('profile_pending_enablement');
      if (!['research_read', 'research_profile'].includes(name)) throw new Error('unknown_research_tool');
      return await read(input, ctx);
    } catch (error) { return { success: false, error: safeError(error),
      ...(error.code === 'search_unavailable' ? { code: error.code, retryable: false, retryAfterMs: error.retryAfterMs, evidence: [] } : {}),
    }; }
  }
  function cancel(id) { const entry = jobs.get(id); entry?.controller.abort(); return { success: Boolean(entry) }; }
  return { execute, status, cancel, jobs };
}

let singleton;
function getResearchService() {
  if (!singleton) {
    const database = require('../core/database.cjs');
    const { getSocialService } = require('../social/social-service.cjs');
    singleton = createResearchService({ queries: database.getQueries(),
      browser: require('../browser-extension/research-control.cjs'),
      resolveSocial: (url, signal) => getSocialService().resolvePublic(url, { signal }),
      saveResource: (data) => require('../tools/ai-tools-handler.cjs').resourceCreate(data),
      fetchPage: require('../services/web/providers/readability-fetch.cjs').scrape,
      searchProviders: { brave: require('../services/web/providers/brave-search.cjs').search,
        tavily: require('../services/web/providers/tavily-search.cjs').search, exa: require('../services/web/providers/exa-search.cjs').search },
      githubFetch: async (path, signal) => {
        const token = require('../auth/github-oauth.cjs').getToken();
        const response = await fetch(`https://api.github.com${path}`, { signal, headers: {
          Accept: 'application/vnd.github+json', 'User-Agent': 'Dome', ...(token ? { Authorization: `Bearer ${token}` } : {}),
        } });
        if (!response.ok) throw new Error(`github_http_${response.status}`);
        return response.json();
      },
    });
  }
  return singleton;
}
module.exports = { createResearchService, getResearchService };
