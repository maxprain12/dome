/**
 * Hybrid Search — chunk embeddings (Nomic) + knowledge graph + FTS
 *
 * Fusion: Reciprocal Rank Fusion (RRF) with k=60 across three ranked lists.
 */

export type HybridSourceTag = 'semantic' | 'graph' | 'fts';

export interface SearchResult {
  id: string;
  title: string;
  type: string;
  /** RRF fusion score (not normalized across queries). */
  score: number;
  /** Which retrieval channels contributed (non-empty). */
  sources: HybridSourceTag[];
  metadata?: Record<string, unknown>;
}

interface GraphNodeData {
  id: string;
  resource_id?: string;
  label?: string;
  type?: string;
  properties?: Record<string, unknown>;
  weight?: number;
  relation?: string;
}

export interface HybridSearchOptions {
  maxResults?: number;
  includeBacklinks?: boolean;
  /** Minimum chunk cosine score to keep a semantic hit (0–1). */
  semanticThreshold?: number;
  /** RRF constant k (default 60). */
  rrfK?: number;
}

/** Row shape from `db.search.unified` resources list (for re-ranking). */
export interface UnifiedSearchResourceRow {
  id: string;
  title?: string;
  type?: string;
  content?: string;
  updated_at?: number;
  metadata?: string | Record<string, unknown>;
}

export type OrderUnifiedHybridOptions = HybridSearchOptions & {
  /** Max resources to return after merge (default: all unified resources). */
  mergeTake?: number;
};

interface RankedListItem {
  id: string;
  title: string;
  type: string;
  metadata?: Record<string, unknown>;
  snippet?: string;
}

const DEFAULT_RRF_K = 60;

function rrfMerge(
  lists: { tag: HybridSourceTag; items: RankedListItem[] }[],
  maxResults: number,
  k: number,
): SearchResult[] {
  const scoreMap = new Map<string, number>();
  const sourcesMap = new Map<string, Set<HybridSourceTag>>();
  const titleMap = new Map<string, string>();
  const typeMap = new Map<string, string>();
  const metaMap = new Map<string, Record<string, unknown>>();
  const snippetMap = new Map<string, string>();

  for (const { tag, items } of lists) {
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const rank = idx + 1;
      const contrib = 1 / (k + rank);
      scoreMap.set(item.id, (scoreMap.get(item.id) ?? 0) + contrib);
      let set = sourcesMap.get(item.id);
      if (!set) {
        set = new Set();
        sourcesMap.set(item.id, set);
      }
      set.add(tag);
      titleMap.set(item.id, item.title);
      typeMap.set(item.id, item.type);
      if (item.metadata && Object.keys(item.metadata).length > 0) {
        metaMap.set(item.id, { ...(metaMap.get(item.id) ?? {}), ...item.metadata });
      }
      if (item.snippet) {
        snippetMap.set(item.id, item.snippet);
      }
    }
  }

  const order: HybridSourceTag[] = ['semantic', 'graph', 'fts'];
  const sourceOrder = (a: HybridSourceTag, b: HybridSourceTag) =>
    order.indexOf(a) - order.indexOf(b);

  return Array.from(scoreMap.entries())
    .map(([id, score]) => {
      const tags = Array.from(sourcesMap.get(id) ?? []).sort(sourceOrder);
      const metadata: Record<string, unknown> = { ...(metaMap.get(id) ?? {}) };
      const snip = snippetMap.get(id);
      if (snip) metadata.snippet = snip;
      metadata.sources = tags;
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

/**
 * Perform hybrid search across semantic chunks, graph, and FTS.
 */
export async function hybridSearch(
  query: string,
  options: HybridSearchOptions = {},
): Promise<SearchResult[]> {
  const maxResults = options.maxResults ?? 50;
  const includeBacklinks = options.includeBacklinks ?? false;
  const semanticThreshold = options.semanticThreshold ?? 0.3;
  const rrfK = options.rrfK ?? DEFAULT_RRF_K;

  /** Local Nomic chunk embeddings */
  let semanticItems: RankedListItem[] = [];
  try {
    const semanticRes = await window.electron.db.semantic.search(query, maxResults);
    if (semanticRes.success && semanticRes.data?.length) {
      semanticItems = semanticRes.data
        .filter((h) => (h.score ?? 0) >= semanticThreshold)
        .map((h) => ({
          id: h.resource_id,
          title: h.title || 'Untitled',
          type: h.type || 'note',
          snippet: h.snippet,
          metadata: {
            chunk_index: h.chunk_index,
            char_start: h.char_start,
            char_end: h.char_end,
            page_number: h.page_number,
            semanticScore: h.score,
          },
        }));
    }
  } catch (error) {
    console.warn('[HybridSearch] Semantic chunk search failed:', error);
  }

  /** Knowledge graph */
  let graphItems: RankedListItem[] = [];
  try {
    const graphResponse = await window.electron.db.graph.searchNodes(query);

    if (graphResponse.success && graphResponse.data) {
      graphItems = (graphResponse.data as GraphNodeData[]).map((node) => ({
        id: node.resource_id || node.id,
        title: node.label ?? '',
        type: (node.properties?.resource_type as string | undefined) || node.type || 'unknown',
        metadata: {
          nodeType: node.type,
          properties: node.properties,
          reason: 'Graph node match',
        },
      }));

      if (includeBacklinks && graphResponse.data.length > 0) {
        for (const node of graphResponse.data.slice(0, 5) as GraphNodeData[]) {
          const neighborsResponse = await window.electron.db.graph.getNeighbors(node.id);
          if (neighborsResponse.success && neighborsResponse.data) {
            const neighbors = (neighborsResponse.data as GraphNodeData[]).map((neighbor) => ({
              id: neighbor.resource_id || neighbor.id,
              title: neighbor.label ?? '',
              type:
                (neighbor.properties?.resource_type as string | undefined) ||
                neighbor.type ||
                'unknown',
              metadata: {
                nodeType: neighbor.type,
                properties: neighbor.properties,
                reason: `Connected to "${node.label}" via ${neighbor.relation}`,
              },
            }));
            graphItems.push(...neighbors);
          }
        }
      }
    }
  } catch (error) {
    console.warn('[HybridSearch] Graph search failed:', error);
  }

  /** FTS */
  let ftsItems: RankedListItem[] = [];
  try {
    const ftsResponse = await window.electron.db.search.unified(query);

    if (ftsResponse.success && ftsResponse.data) {
      ftsItems = ftsResponse.data.resources.map((resource) => ({
        id: resource.id,
        title: resource.title,
        type: resource.type,
        metadata: { content: resource.content },
      }));
    }
  } catch (error) {
    console.warn('[HybridSearch] FTS search failed:', error);
  }

  return rrfMerge(
    [
      { tag: 'semantic', items: semanticItems },
      { tag: 'graph', items: graphItems },
      { tag: 'fts', items: ftsItems },
    ],
    maxResults,
    rrfK,
  );
}

/**
 * Re-order unified FTS resource rows using hybrid RRF ordering (semantic + graph + FTS).
 * Resources only in unified but not in hybrid candidates are appended in original order.
 */
export async function orderUnifiedResourcesByHybrid(
  query: string,
  unifiedResources: UnifiedSearchResourceRow[],
  options: OrderUnifiedHybridOptions = {},
): Promise<UnifiedSearchResourceRow[]> {
  const q = query.trim();
  if (!q || unifiedResources.length === 0) {
    return unifiedResources;
  }
  const mergeTake = options.mergeTake ?? unifiedResources.length;
  const maxResults = Math.max(mergeTake * 3, 30);
  const hybrid = await hybridSearch(q, {
    maxResults,
    includeBacklinks: options.includeBacklinks,
    semanticThreshold: options.semanticThreshold,
    rrfK: options.rrfK,
  });
  const byId = new Map(unifiedResources.map((r) => [r.id, r]));
  const out: UnifiedSearchResourceRow[] = [];
  const seen = new Set<string>();
  for (const h of hybrid) {
    const row = byId.get(h.id);
    if (row && !seen.has(row.id)) {
      seen.add(row.id);
      out.push(row);
    }
  }
  for (const r of unifiedResources) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      out.push(r);
    }
  }
  return mergeTake >= out.length ? out : out.slice(0, mergeTake);
}

/**
 * Get related resources using graph traversal
 */
export async function getRelatedResources(
  resourceId: string,
  maxDepth: number = 2,
): Promise<SearchResult[]> {
  const visited = new Set<string>();
  const results: SearchResult[] = [];

  async function traverse(nodeId: string, depth: number, weight: number) {
    if (depth > maxDepth || visited.has(nodeId)) return;
    visited.add(nodeId);

    try {
      const response = await window.electron.db.graph.getNeighbors(nodeId);
      if (response.success && response.data) {
        for (const neighbor of response.data as GraphNodeData[]) {
          const neighborId = neighbor.resource_id || neighbor.id;
          if (!visited.has(neighborId)) {
            results.push({
              id: neighborId,
              title: neighbor.label ?? '',
              type:
                (neighbor.properties?.resource_type as string | undefined) ||
                neighbor.type ||
                'unknown',
              score: weight * (neighbor.weight || 0.5),
              sources: ['graph'],
              metadata: {
                depth,
                relation: neighbor.relation,
                nodeType: neighbor.type,
                sources: ['graph'],
              },
            });

            await traverse(neighborId, depth + 1, weight * 0.7);
          }
        }
      }
    } catch (error) {
      console.error('[HybridSearch] Error traversing graph:', error);
    }
  }

  const nodeResponse = await window.electron.db.graph.getNode(`node-${resourceId}`);
  if (nodeResponse.success && nodeResponse.data) {
    await traverse(nodeResponse.data.id, 1, 1.0);
  }

  return results.sort((a, b) => b.score - a.score);
}
