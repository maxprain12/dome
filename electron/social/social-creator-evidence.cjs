'use strict';

function creatorEvidencePack(evidence, { member, theme = null, limitations = [] }) {
  const posts = evidence.filter((item) => item.kind !== 'profile');
  const dated = posts.map((item) => item.publishedAt).filter(Number.isFinite);
  // Keep both ends of the archive when the text sample needs to be bounded.
  const sample = posts.length <= 120 ? posts : Array.from({ length: 120 }, (_, index) => posts[Math.round(index * (posts.length - 1) / 119)]);
  const profile = evidence.find((item) => item.kind === 'profile');
  return {
    coverage: {
      savedPosts: posts.length,
      analyzedPosts: sample.length,
      oldestPublishedAt: dated.length ? Math.min(...dated) : null,
      newestPublishedAt: dated.length ? Math.max(...dated) : null,
      undatedPosts: posts.length - dated.length,
      completeHistory: false,
    },
    handle: member.handle,
    url: member.profileUrl,
    theme,
    followers: profile?.followers ?? null,
    postsCount: profile?.postsCount ?? null,
    limitations: [...new Set([...limitations, 'partial_history'])],
    posts: sample.map((item) => ({
      publishedAt: item.publishedAt,
      title: item.title,
      url: item.url,
      format: item.format,
      topics: item.topics,
      body: String(item.body || '').slice(0, 2000),
      metrics: item.metrics,
      limitations: item.limitations,
    })),
  };
}

module.exports = { creatorEvidencePack };
