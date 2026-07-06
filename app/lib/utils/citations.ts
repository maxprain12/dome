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

type ResourceResult = Record<string, unknown>;
type ResourceResults = ResourceResult[];

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

function asRecord(value: unknown): ResourceResult | null {
  return value !== null && typeof value === 'object'
    ? (value as ResourceResult)
    : null;
}

function tryParseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function isResourceSearchTool(name: string): boolean {
  return (
    name === 'resource_search' ||
    name === 'resource_semantic_search' ||
    name === 'resource_hybrid_search'
  );
}

function extractNumericPages(pages: unknown): number[] | undefined {
  if (!Array.isArray(pages)) return undefined;
  const result: number[] = [];
  for (const page of pages) {
    const n = Number(page);
    if (Number.isFinite(n)) result.push(n);
  }
  return result;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function buildSearchCitation(r: ResourceResult, citationCounter: number): ParsedCitation {
  const pages = extractNumericPages(r.pages);
  const contentStr = asString(r.content);
  return {
    number: citationCounter,
    sourceId: asString(r.id),
    sourceTitle: asString(r.title),
    resourceType: asString(r.type),
    passage: asString(r.snippet) || contentStr?.slice(0, 200),
    pages,
    page: pages && pages.length > 0 ? pages[0] : undefined,
    pageLabel: asString(r.page_range),
    nodeTitle: asString(r.node_title),
    nodeId: asString(r.node_id),
    nodePath: Array.isArray(r.node_path) ? (r.node_path as string[]) : undefined,
  };
}

function buildGetCitation(
  resource: ResourceResult,
  citationCounter: number,
): ParsedCitation | null {
  if (typeof resource.id !== 'string') return null;
  const passageStr = asString(resource.content)?.slice(0, 200);
  const summaryStr = asString(resource.summary);
  return {
    number: citationCounter,
    sourceId: resource.id,
    sourceTitle: asString(resource.title),
    resourceType: asString(resource.type),
    passage: passageStr || summaryStr,
  };
}

function addSearchCitations(
  parsedResult: ResourceResult | null,
  map: Map<number, ParsedCitation>,
  startCounter: number,
): number {
  const rawResults = parsedResult?.results;
  const results: ResourceResults = Array.isArray(rawResults)
    ? (rawResults as ResourceResults)
    : [];
  let counter = startCounter;
  for (const r of results) {
    map.set(counter, buildSearchCitation(r, counter));
    counter++;
  }
  return counter;
}

function addGetCitation(
  parsedResult: ResourceResult | null,
  map: Map<number, ParsedCitation>,
  counter: number,
): number {
  const resourceRaw = parsedResult?.resource ?? parsedResult;
  const resource = asRecord(resourceRaw);
  if (!resource) return counter;
  const citation = buildGetCitation(resource, counter);
  if (!citation) return counter;
  map.set(counter, citation);
  return counter + 1;
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

  for (const toolResult of toolResults) {
    const parsedResult = asRecord(tryParseJson(toolResult.result));
    if (isResourceSearchTool(toolResult.name)) {
      citationCounter = addSearchCitations(parsedResult, map, citationCounter);
    } else if (toolResult.name === 'resource_get') {
      citationCounter = addGetCitation(parsedResult, map, citationCounter);
    }
  }

  return map;
}