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
  toolResults: Array<{ name: string; result: any }> | undefined
): Map<number, ParsedCitation> {
  const map = new Map<number, ParsedCitation>();
  if (!toolResults) return map;

  let citationCounter = 1;

  const parseResult = (value: unknown): any => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  };

  for (const toolResult of toolResults) {
    const parsedResult = parseResult(toolResult.result);
    if (toolResult.name === 'resource_search' || toolResult.name === 'resource_semantic_search') {
      const results = parsedResult?.results || [];
      for (const r of results) {
        const pages = Array.isArray(r.pages)
          ? r.pages.map((page: unknown) => Number(page)).filter((page: number) => Number.isFinite(page))
          : undefined;
        map.set(citationCounter, {
          number: citationCounter,
          sourceId: r.id,
          sourceTitle: r.title,
          resourceType: r.type,
          passage: r.snippet || r.content?.slice(0, 200),
          pages,
          page: pages && pages.length > 0 ? pages[0] : undefined,
          pageLabel: r.page_range,
          nodeTitle: r.node_title,
          nodeId: r.node_id,
          nodePath: Array.isArray(r.node_path) ? r.node_path : undefined,
        });
        citationCounter++;
      }
    } else if (toolResult.name === 'resource_get') {
      const resource = parsedResult?.resource ?? parsedResult;
      if (resource?.id) {
        map.set(citationCounter, {
          number: citationCounter,
          sourceId: resource.id,
          sourceTitle: resource.title,
          resourceType: resource.type,
          passage: resource.content?.slice(0, 200) || resource.summary,
        });
        citationCounter++;
      }
    }
  }

  return map;
}
