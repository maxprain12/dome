'use strict';

/**
 * Reciprocal Rank Fusion (RRF) for hybrid lexical + semantic + graph retrieval.
 * Same k=60 default as app/lib/search/hybrid-search.ts.
 */

const DEFAULT_RRF_K = 60;

/**
 * @param {{ tag: string; items: Array<{ id: string; title?: string; type?: string; snippet?: string; metadata?: Record<string, unknown> }> }[]} lists
 * @param {number} maxResults
 * @param {number} [k]
 * @returns {Array<{ id: string; title: string; type: string; score: number; sources: string[]; metadata?: Record<string, unknown> }>}
 */
function rrfMerge(lists, maxResults, k = DEFAULT_RRF_K) {
  const scoreMap = new Map();
  const sourcesMap = new Map();
  const titleMap = new Map();
  const typeMap = new Map();
  const metaMap = new Map();
  const snippetMap = new Map();

  for (const { tag, items } of lists) {
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const rank = idx + 1;
      const contrib = 1 / (k + rank);
      const id = item.id;
      scoreMap.set(id, (scoreMap.get(id) ?? 0) + contrib);
      if (!sourcesMap.has(id)) sourcesMap.set(id, new Set());
      sourcesMap.get(id).add(tag);
      titleMap.set(id, item.title ?? '');
      typeMap.set(id, item.type ?? 'note');
      if (item.metadata && Object.keys(item.metadata).length > 0) {
        metaMap.set(id, { ...(metaMap.get(id) ?? {}), ...item.metadata });
      }
      if (item.snippet) snippetMap.set(id, item.snippet);
    }
  }

  const sourceOrder = ['semantic', 'graph', 'fts'];
  const sourceCmp = (a, b) => sourceOrder.indexOf(a) - sourceOrder.indexOf(b);

  return Array.from(scoreMap.entries())
    .map(([id, score]) => {
      const tags = Array.from(sourcesMap.get(id) ?? []).sort(sourceCmp);
      const metadata = { ...(metaMap.get(id) ?? {}) };
      const snip = snippetMap.get(id);
      if (snip) metadata.snippet = snip;
      metadata.hybrid_sources = tags;
      return {
        id,
        title: titleMap.get(id) || 'Untitled',
        type: typeMap.get(id) || 'note',
        score,
        sources: tags,
        metadata,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

module.exports = { rrfMerge, DEFAULT_RRF_K };
