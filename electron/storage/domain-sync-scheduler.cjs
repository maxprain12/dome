'use strict';

/**
 * Background scheduler for Domain Sync v1 — 60 s interval + on-demand domain pulls.
 * Maintains its own long-lived SSE connection to `/api/v1/sync/events` (see
 * `runSseLoop` below); on `{ type: 'domain', domain }` it calls
 * `notifyDomainChanged(domain)` to queue an immediate pull. This is independent
 * from `cloud-sync-service.cjs` (bundle sync v3), which has no SSE client of its own.
 */
/* eslint-disable no-console */

const domainSync = require('./domain-sync.cjs');
const planGate = require('./plan-gate.cjs');
const actionQueue = require('./action-queue-consumer.cjs');

const INTERVAL_MS = 60_000;
const SSE_RETRY_MIN_MS = 5_000;
const SSE_RETRY_MAX_MS = 5 * 60_000;

/** @type {ReturnType<typeof setInterval> | null} */
let timer = null;
/** @type {{ database: object, windowManager?: object } | null} */
let deps = null;
/** @type {Set<string>} */
const pendingDomains = new Set();
/** @type {boolean} */
let running = false;
/** @type {boolean} */
let actionsPending = false;
/** @type {AbortController | null} */
let sseAbort = null;
/** @type {boolean} */
let sseStopped = true;

/**
 * @param {{ database: object, windowManager?: object }} nextDeps
 */
function init(nextDeps) {
  deps = nextDeps;
}

function start() {
  if (timer) return;
  timer = setInterval(() => {
    void tick();
  }, INTERVAL_MS);
  if (timer.unref) timer.unref();
  sseStopped = false;
  void runSseLoop();
  console.log('[domain-sync] scheduler started (60s + SSE)');
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  sseStopped = true;
  sseAbort?.abort();
  sseAbort = null;
  pendingDomains.clear();
  running = false;
}

/**
 * Queue an immediate sync for one domain (deduped).
 * @param {import('./domain-sync.cjs').DomainName} domain
 */
function notifyDomainChanged(domain) {
  if (domain === 'actions') {
    actionsPending = true;
    void tick();
    return;
  }
  if (!domainSync.VALID_DOMAINS.includes(domain)) return;
  pendingDomains.add(domain);
  void tick();
}

/**
 * Long-lived SSE consumer of /api/v1/sync/events (contract §1.3): on
 * `{ type: 'domain', domain }` queue an immediate pull of that domain.
 * Reconnects with exponential backoff; silent while not entitled/connected.
 */
async function runSseLoop() {
  const { getDomeProviderBaseUrl } = require('../ai/dome-provider-url.cjs');
  const domeOauth = require('../auth/dome-oauth.cjs');
  let retryMs = SSE_RETRY_MIN_MS;

  while (!sseStopped) {
    let connectedAt = 0;
    try {
      const ent = await planGate.getEntitlements(deps?.database);
      if (!ent.entitlements.showCloudUi) {
        await sleep(SSE_RETRY_MAX_MS);
        continue;
      }
      const base = getDomeProviderBaseUrl().replace(/\/$/, '');
      sseAbort = new AbortController();
      const res = await domeOauth.fetchWithDomeAuth(deps.database, `${base}/api/v1/sync/events`, {
        method: 'GET',
        headers: { Accept: 'text/event-stream' },
        signal: sseAbort.signal,
      });
      if (!res.ok || !res.body) throw new Error(`sse_status_${res.status}`);

      connectedAt = Date.now();
      retryMs = SSE_RETRY_MIN_MS;
      let buffer = '';
      const decoder = new TextDecoder();
      for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
          if (!dataLine) continue;
          try {
            const event = JSON.parse(dataLine.slice(5).trim());
            if (event?.type === 'domain' && typeof event.domain === 'string') {
              notifyDomainChanged(event.domain);
            }
          } catch {
            /* malformed frame — ignore */
          }
        }
      }
    } catch (err) {
      // Los proxies (Cloudflare) cortan conexiones largas: reconectar en silencio.
      // Solo es señal de problema si la conexión murió casi al instante.
      const shortLived = !connectedAt || Date.now() - connectedAt < 30_000;
      if (!sseStopped && shortLived) {
        console.warn('[domain-sync] SSE disconnected:', err?.message || err);
      }
    } finally {
      sseAbort = null;
    }
    if (sseStopped) break;
    await sleep(retryMs);
    retryMs = Math.min(retryMs * 2, SSE_RETRY_MAX_MS);
  }
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (t.unref) t.unref();
  });
}

async function tick() {
  if (!deps?.database || running) return;
  running = true;
  try {
    const ent = await planGate.getEntitlements(deps.database);
    if (!ent.entitlements.showCloudUi) return;

    const db = deps.database.getDB?.();
    if (!db) return;

    const domains =
      pendingDomains.size > 0
        ? [...pendingDomains].filter((d) => ent.entitlements.features.includes(planGate.featureForDomain(d)))
        : domainSync.VALID_DOMAINS.filter((d) => {
            if (!domainSync.getDomainState(db, d).enabled) return false;
            return ent.entitlements.features.includes(planGate.featureForDomain(d));
          });

    pendingDomains.clear();

    for (const domain of domains) {
      try {
        await domainSync.syncDomain(deps, domain);
      } catch (err) {
        console.warn('[domain-sync] tick failed', domain, err?.message || err);
      }
    }

    // Action queue: on every tick (cheap when empty; SSE also sets actionsPending).
    actionsPending = false;
    if (ent.entitlements.features.includes('cloud_sync')) {
      try {
        await actionQueue.processActionQueue(deps);
      } catch (err) {
        console.warn('[domain-sync] action queue failed', err?.message || err);
      }
    }
  } finally {
    running = false;
  }
}

module.exports = {
  init,
  start,
  stop,
  notifyDomainChanged,
  tick,
};
