
'use strict';
const { createHash } = require('node:crypto');

function evidence({ platform, url, title, text, method, publishedAt = null, metrics = null, identity = null, limitations = [] }) {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('invalid_evidence_url');
  parsed.username = '';
  parsed.password = '';
  for (const key of [...parsed.searchParams.keys()]) {
    if (/token|secret|password|api.?key|authorization|cookie/i.test(key)) parsed.searchParams.delete(key);
  }
  const canonical = parsed.href;
  return {
    id: createHash('sha256').update(`${platform}:${canonical}`).digest('hex').slice(0, 24),
    platform, url: canonical, title: String(title || canonical).slice(0, 500),
    text: String(text || '').replace(/Bearer\s+[A-Za-z0-9._~+\/=-]+/gi, 'Bearer [redacted]').replace(/(?:sk|key|token)[_-][A-Za-z0-9_-]{16,}/g, '[redacted]').slice(0, 20000),
    publishedAt: Number.isFinite(publishedAt) ? publishedAt : null,
    capturedAt: Date.now(), metrics, identity,
    provenance: { method, sourceUrl: canonical },
    coverage: { completeHistory: false },
    limitations: [...new Set(limitations)],
  };
}

function markdown(items) {
  return items.map((item) => `## ${item.title.replace(/[\r\n]/g, ' ')}\n\nSource: <${item.url}>\nCaptured: ${new Date(item.capturedAt).toISOString()}\nMethod: ${item.provenance.method}\nCoverage: partial\n\n${item.text}\n`).join('\n');
}

module.exports = { evidence, markdown };
