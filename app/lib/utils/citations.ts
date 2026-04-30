/**
 * Citation parsing utilities for AI responses.
 * Extracts [1], [2] etc. markers and maps them to source references.
 */

export interface ParsedCitation {
  number: number;
  sourceId?: string;
  sourceTitle?: string;
  resourceType?: string;
  passage?: string;
  pages?: number[];
  page?: number;
  pageLabel?: string;
  nodeTitle?: string;
  nodeId?: string;
  nodePath?: string[];
}

/**
 * Extract citation numbers from text like "According to the study [1], this is true [2]."
 * Returns unique sorted citation numbers found.
 */
export function extractCitationNumbers(text: string): number[] {
  const regex = /\[(\d+)\]/g;
  const numbers = new Set<number>();
  let match;
  while ((match = regex.exec(text)) !== null) {
    numbers.add(parseInt(match[1] ?? '0', 10));
  }
  return Array.from(numbers).sort((a, b) => a - b);
}

/**
 * Parse AI response text and return segments with citation info.
 * Replaces [N] markers with a placeholder for React rendering.
 */
export function splitTextWithCitations(text: string): Array<{ type: 'text' | 'citation'; content: string; citationNumber?: number }> {
  const parts: Array<{ type: 'text' | 'citation'; content: string; citationNumber?: number }> = [];
  const regex = /\[(\d+)\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the citation
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    // Add the citation
    parts.push({ type: 'citation', content: match[0] ?? '', citationNumber: parseInt(match[1] ?? '0', 10) });
    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return parts;
}

/**
 * Build a citation map from tool results.
 * When the AI uses resource_search or resource_get tools, we can map [N] to actual sources.
 */
export function buildCitationMap(
  toolResults: Array<{ name: string; result?: unknown }> | undefined,
): Map<number, ParsedCitation> {
  const map = new Map<number, ParsedCitation>();
  if (!toolResults) return map;

  let citationCounter = 1;

  const parseResult = (value: unknown): unknown => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  };

  for (const toolResult of toolResults) {
    const parsedResultRaw = parseResult(toolResult.result);
    const parsedResult =
      parsedResultRaw !== null && typeof parsedResultRaw === 'object'
        ? (parsedResultRaw as Record<string, unknown>)
        : null;
    if (
      toolResult.name === 'resource_search' ||
      toolResult.name === 'resource_semantic_search' ||
      toolResult.name === 'resource_hybrid_search'
    ) {
      const results = (Array.isArray(parsedResult?.results) ? parsedResult.results : []) as Record<
        string,
        unknown
      >[];
      for (const r of results) {
        const pages = Array.isArray(r.pages)
          ? r.pages.map((page: unknown) => Number(page)).filter((page: number) => Number.isFinite(page))
          : undefined;
        const contentVal = r.content;
        const contentStr = typeof contentVal === 'string' ? contentVal : undefined;
        map.set(citationCounter, {
          number: citationCounter,
          sourceId: typeof r.id === 'string' ? r.id : undefined,
          sourceTitle: typeof r.title === 'string' ? r.title : undefined,
          resourceType: typeof r.type === 'string' ? r.type : undefined,
          passage: (typeof r.snippet === 'string' ? r.snippet : undefined) || contentStr?.slice(0, 200),
          pages,
          page: pages && pages.length > 0 ? pages[0] : undefined,
          pageLabel: typeof r.page_range === 'string' ? r.page_range : undefined,
          nodeTitle: typeof r.node_title === 'string' ? r.node_title : undefined,
          nodeId: typeof r.node_id === 'string' ? r.node_id : undefined,
          nodePath: Array.isArray(r.node_path) ? (r.node_path as string[]) : undefined,
        });
        citationCounter++;
      }
    } else if (toolResult.name === 'resource_get') {
      const resourceRaw = parsedResult?.resource ?? parsedResult;
      const resource =
        resourceRaw !== null && typeof resourceRaw === 'object'
          ? (resourceRaw as Record<string, unknown>)
          : null;
      if (resource && typeof resource.id === 'string') {
        const passageContent = resource.content;
        const passageStr = typeof passageContent === 'string' ? passageContent.slice(0, 200) : undefined;
        const summaryStr = typeof resource.summary === 'string' ? resource.summary : undefined;
        map.set(citationCounter, {
          number: citationCounter,
          sourceId: resource.id,
          sourceTitle: typeof resource.title === 'string' ? resource.title : undefined,
          resourceType: typeof resource.type === 'string' ? resource.type : undefined,
          passage: passageStr || summaryStr,
        });
        citationCounter++;
      }
    }
  }

  return map;
}
