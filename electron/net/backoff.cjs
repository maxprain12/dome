function fullJitterBackoffMs(attempt, { baseMs = 1000, maxMs = 60_000 } = {}) {
  const cap = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.floor(Math.random() * cap);
}

function withJitter(ms, ratio = 0.2) {
  const delta = ms * ratio;
  return Math.max(0, Math.round(ms - delta + Math.random() * 2 * delta));
}

function parseRetryAfterMs(res, now = Date.now()) {
  const raw = res?.headers?.get?.('retry-after') ?? res?.headers?.['retry-after'];
  if (raw == null || raw === '') return null;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return secs * 1000;
  const at = Date.parse(String(raw));
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

module.exports = { fullJitterBackoffMs, withJitter, parseRetryAfterMs };
