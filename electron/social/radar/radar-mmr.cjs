'use strict';

function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0) return 0;
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i += 1) {
    const av = Number(a[i]) || 0;
    const bv = Number(b[i]) || 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function tokenSet(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .split(/[^\p{L}\p{N}#]+/u)
      .filter(Boolean),
  );
}

function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const token of a) {
    if (b.has(token)) inter += 1;
  }
  return inter / (a.size + b.size - inter);
}

function defaultSimilarity(left, right) {
  if (left.embedding && right.embedding) return cosine(left.embedding, right.embedding);
  return jaccard(
    tokenSet([left.title, left.topicKey, ...(left.topics || [])].join(' ')),
    tokenSet([right.title, right.topicKey, ...(right.topics || [])].join(' ')),
  );
}

function mmrRerank(items, { lambda = 0.7, similarity = defaultSimilarity, limit = 12, scoreKey = 'forYouScore' } = {}) {
  const pool = (items || []).slice();
  const selected = [];
  while (pool.length > 0 && selected.length < limit) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < pool.length; i += 1) {
      const candidate = pool[i];
      const relevance = Number(candidate[scoreKey] ?? candidate.trendScore ?? 0);
      const maxSim = selected.reduce((acc, item) => Math.max(acc, similarity(candidate, item)), 0);
      const mmr = lambda * relevance - (1 - lambda) * maxSim;
      if (mmr > bestScore) {
        bestScore = mmr;
        bestIndex = i;
      }
    }
    selected.push(pool.splice(bestIndex, 1)[0]);
  }
  return selected;
}

module.exports = {
  cosine,
  defaultSimilarity,
  jaccard,
  mmrRerank,
  tokenSet,
};
