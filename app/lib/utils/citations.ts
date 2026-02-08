/**
 * Citation parsing utilities for AI responses.
 * Extracts [1], [2] etc. markers and maps them to source references.
 */

export interface ParsedCitation {
  number: number;
  sourceId?: string;
  sourceTitle?: string;
  passage?: string;
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

  for (const toolResult of toolResults) {
    if (toolResult.name === 'resource_search' || toolResult.name === 'resource_semantic_search') {
      const results = toolResult.result?.results || [];
      for (const r of results) {
        map.set(citationCounter, {
          number: citationCounter,
          sourceId: r.id,
          sourceTitle: r.title,
          passage: r.snippet || r.content?.slice(0, 200),
        });
        citationCounter++;
      }
    } else if (toolResult.name === 'resource_get') {
      const resource = toolResult.result?.resource;
      if (resource) {
        map.set(citationCounter, {
          number: citationCounter,
          sourceId: resource.id,
          sourceTitle: resource.title,
          passage: resource.content?.slice(0, 200) || resource.summary,
        });
        citationCounter++;
      }
    }
  }

  return map;
}
