'use strict';
const { assertPublicUrl } = require('./url-guard.cjs');

// Google may expose signed /goto links instead of a decodable destination.
// Resolve only these observed organic links locally, without reading target bodies.
async function resolveEngineUrls(entries, signal, dependencies = {}) {
  const fetch = dependencies.fetch || globalThis.fetch;
  const validateUrl = dependencies.validateUrl || assertPublicUrl;
  const resolved = [];
  for (const entry of entries.slice(0, 20)) {
    signal?.throwIfAborted();
    try {
      const url = new URL(entry.url);
      if (!/(^|\.)google\.[a-z.]+$/.test(url.hostname) || url.pathname !== '/goto') { resolved.push(entry); continue; }
      const deadline = AbortSignal.timeout(5000);
      const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
      await validateUrl(url.toString());
      const response = await fetch(url, { redirect: 'manual', signal: requestSignal });
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (response.status >= 300 && response.status < 400 && location) {
        const target = new URL(location, url).toString();
        await validateUrl(target);
        resolved.push({ ...entry, url: target });
      }
    } catch (error) { if (signal?.aborted) throw error; }
  }
  return resolved;
}
module.exports = { resolveEngineUrls };
