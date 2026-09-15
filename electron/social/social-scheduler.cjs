'use strict';

/**
 * Choose which due scheduled posts the desktop scheduler should publish.
 *
 * The provider in-process ticker (`[social-publish]`) publishes Instagram for
 * `cloud_publishing` accounts. LinkedIn/X stay on the local tick until the
 * worker supports them. If the cloud tick is down, Instagram is retried locally
 * after `cloudFallbackMs` (default 10 min).
 *
 * @param {Array<{ id: string, accountId?: string | null, provider?: string, scheduledAt?: number }>} due
 * @param {{
 *   cloudWorkerProviders?: string[],
 *   isAccountCloudPublishing?: (accountId: string) => boolean,
 *   now?: number,
 *   cloudFallbackMs?: number,
 * }} [opts]
 */
function selectDuePostsForLocalTick(due, opts = {}) {
  const posts = Array.isArray(due) ? due : [];
  const providers = Array.isArray(opts.cloudWorkerProviders)
    ? opts.cloudWorkerProviders.map((value) => String(value).toLowerCase())
    : [];
  if (!providers.length) return posts;
  const isCloud = opts.isAccountCloudPublishing;
  if (typeof isCloud !== 'function') return posts;
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const fallbackMs = Number.isFinite(opts.cloudFallbackMs) ? opts.cloudFallbackMs : 10 * 60 * 1000;
  return posts.filter((post) => {
    if (!post.accountId || !isCloud(post.accountId)) return true;
    if (!providers.includes(String(post.provider || '').toLowerCase())) return true;
    const scheduledAt = Number(post.scheduledAt);
    return Number.isFinite(scheduledAt) && now - scheduledAt >= fallbackMs;
  });
}

module.exports = { selectDuePostsForLocalTick };
