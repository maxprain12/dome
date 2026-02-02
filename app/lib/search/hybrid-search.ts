/**
 * Hybrid Search - Merges results from Vector DB and Knowledge Graph
 *
 * Strategy:
 * - Vector DB (LanceDB): Semantic similarity search (70% weight)
 * - Knowledge Graph (SQLite): Relationship-based search (30% weight)
 * - Merge and rank results using weighted scoring
 */

interface SearchResult {
  id: string;
  title: string;
  type: string;
  score: number;
  source: 'vector' | 'graph' | 'fts' | 'hybrid';
  metadata?: any;
}

interface HybridSearchOptions {
  vectorWeight?: number;  // Default: 0.7
  graphWeight?: number;   // Default: 0.3
  maxResults?: number;    // Default: 50
  includeBacklinks?: boolean; // Include backlinks in graph search
  semanticThreshold?: number; // Minimum similarity score for vector results
}

/**
 * Normalize scores to 0-1 range
 */
function normalizeScores(results: SearchResult[]): SearchResult[] {
  if (results.length === 0) return results;

  const maxScore = Math.max(...results.map(r => r.score));
  const minScore = Math.min(...results.map(r => r.score));
  const range = maxScore - minScore;

  if (range === 0) {
    return results.map(r => ({ ...r, score: 1.0 }));
  }

  return results.map(r => ({
    ...r,
    score: (r.score - minScore) / range,
  }));
}

/**
 * Merge and rank results from multiple sources
 */
function mergeResults(
  vectorResults: SearchResult[],
  graphResults: SearchResult[],
  ftsResults: SearchResult[],
  options: Required<HybridSearchOptions>
): SearchResult[] {
  const { vectorWeight, graphWeight, maxResults } = options;

  // Normalize scores within each source
  const normalizedVector = normalizeScores(vectorResults);
  const normalizedGraph = normalizeScores(graphResults);
  const normalizedFts = normalizeScores(ftsResults);

  // Merge results by ID
  const mergedMap = new Map<string, SearchResult>();

  // Add vector results
  for (const result of normalizedVector) {
    mergedMap.set(result.id, {
      ...result,
      score: result.score * vectorWeight,
      source: 'vector',
    });
  }

  // Add/merge graph results
  for (const result of normalizedGraph) {
    const existing = mergedMap.get(result.id);
    if (existing) {
      // Merge scores
      existing.score += result.score * graphWeight;
      existing.source = 'hybrid';
      existing.metadata = {
        ...existing.metadata,
        graphReason: result.metadata?.reason,
      };
    } else {
      mergedMap.set(result.id, {
        ...result,
        score: result.score * graphWeight,
        source: 'graph',
      });
    }
  }

  // Add FTS results (only if not already present)
  for (const result of normalizedFts) {
    if (!mergedMap.has(result.id)) {
      mergedMap.set(result.id, {
        ...result,
        score: result.score * 0.5, // Lower weight for FTS fallback
        source: 'fts',
      });
    }
  }

  // Sort by score and limit
  return Array.from(mergedMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

/**
 * Perform hybrid search across vector DB, knowledge graph, and FTS
 */
export async function hybridSearch(
  query: string,
  options: HybridSearchOptions = {}
): Promise<SearchResult[]> {
  const opts: Required<HybridSearchOptions> = {
    vectorWeight: options.vectorWeight ?? 0.7,
    graphWeight: options.graphWeight ?? 0.3,
    maxResults: options.maxResults ?? 50,
    includeBacklinks: options.includeBacklinks ?? false,
    semanticThreshold: options.semanticThreshold ?? 0.3,
  };

  // 1. Vector search (semantic similarity)
  let vectorResults: SearchResult[] = [];
  try {
    const vectorResponse = await window.electron.vector.search(query, {
      limit: opts.maxResults,
      threshold: opts.semanticThreshold,
    });

    if (vectorResponse.success && vectorResponse.data) {
      vectorResults = vectorResponse.data.map((result: any) => ({
        id: result.resource_id || result.id,
        title: result.metadata?.title || 'Untitled',
        type: result.metadata?.resource_type || 'unknown',
        score: result.score || result._distance ? 1 - result._distance : 0,
        source: 'vector' as const,
        metadata: result.metadata,
      }));
    }
  } catch (error) {
    console.warn('[HybridSearch] Vector search failed:', error);
    // Continue with other search methods
  }

  // 2. Graph search (relationship-based)
  let graphResults: SearchResult[] = [];
  try {
    // Search graph nodes by label
    const graphResponse = await window.electron.db.graph.searchNodes(query);

    if (graphResponse.success && graphResponse.data) {
      graphResults = graphResponse.data.map((node: any) => ({
        id: node.resource_id || node.id,
        title: node.label,
        type: node.properties?.resource_type || node.type,
        score: 1.0, // Exact match in graph
        source: 'graph' as const,
        metadata: {
          nodeType: node.type,
          properties: node.properties,
          reason: 'Graph node match',
        },
      }));

      // Optionally include backlinks
      if (opts.includeBacklinks && graphResponse.data.length > 0) {
        // For each matched node, get neighbors
        for (const node of graphResponse.data.slice(0, 5)) {
          const neighborsResponse = await window.electron.db.graph.getNeighbors(node.id);
          if (neighborsResponse.success && neighborsResponse.data) {
            const neighbors = neighborsResponse.data.map((neighbor: any) => ({
              id: neighbor.resource_id || neighbor.id,
              title: neighbor.label,
              type: neighbor.properties?.resource_type || neighbor.type,
              score: neighbor.weight || 0.5,
              source: 'graph' as const,
              metadata: {
                nodeType: neighbor.type,
                properties: neighbor.properties,
                reason: `Connected to "${node.label}" via ${neighbor.relation}`,
              },
            }));
            graphResults.push(...neighbors);
          }
        }
      }
    }
  } catch (error) {
    console.warn('[HybridSearch] Graph search failed:', error);
  }

  // 3. FTS fallback (always available)
  let ftsResults: SearchResult[] = [];
  try {
    const ftsResponse = await window.electron.db.search.unified(query);

    if (ftsResponse.success && ftsResponse.data) {
      ftsResults = ftsResponse.data.resources.map((resource: any) => ({
        id: resource.id,
        title: resource.title,
        type: resource.type,
        score: 0.8, // Good match from FTS
        source: 'fts' as const,
        metadata: {
          content: resource.content,
        },
      }));
    }
  } catch (error) {
    console.warn('[HybridSearch] FTS search failed:', error);
  }

  // 4. Merge and rank
  return mergeResults(vectorResults, graphResults, ftsResults, opts);
}

/**
 * Get related resources using graph traversal
 */
export async function getRelatedResources(
  resourceId: string,
  maxDepth: number = 2
): Promise<SearchResult[]> {
  const visited = new Set<string>();
  const results: SearchResult[] = [];

  async function traverse(nodeId: string, depth: number, weight: number) {
    if (depth > maxDepth || visited.has(nodeId)) return;
    visited.add(nodeId);

    try {
      const response = await window.electron.db.graph.getNeighbors(nodeId);
      if (response.success && response.data) {
        for (const neighbor of response.data) {
          const neighborId = neighbor.resource_id || neighbor.id;
          if (!visited.has(neighborId)) {
            results.push({
              id: neighborId,
              title: neighbor.label,
              type: neighbor.properties?.resource_type || neighbor.type,
              score: weight * ((neighbor as any).weight || 0.5),
              source: 'graph',
              metadata: {
                depth,
                relation: (neighbor as any).relation,
                nodeType: neighbor.type,
              },
            });

            // Traverse deeper with decaying weight
            await traverse(neighborId, depth + 1, weight * 0.7);
          }
        }
      }
    } catch (error) {
      console.error('[HybridSearch] Error traversing graph:', error);
    }
  }

  // Get node ID for resource
  const nodeResponse = await window.electron.db.graph.getNode(`node-${resourceId}`);
  if (nodeResponse.success && nodeResponse.data) {
    await traverse(nodeResponse.data.id, 1, 1.0);
  }

  return results.sort((a, b) => b.score - a.score);
}
