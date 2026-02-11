/**
 * Web Search Tool
 * 
 * Search the web using Brave Search or Perplexity APIs.
 * Based on clawdbot's src/agents/tools/web-search.ts
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import {
  jsonResult,
  readStringParam,
  readNumberParam,
  readCache,
  writeCache,
  normalizeCacheKey,
  withTimeout,
  resolveTimeoutSeconds,
  resolveCacheTtlMs,
  readResponseText,
  type CacheEntry,
} from './common';

// =============================================================================
// Constants
// =============================================================================

const SEARCH_PROVIDERS = ['brave', 'perplexity'] as const;
type SearchProvider = typeof SEARCH_PROVIDERS[number];

const DEFAULT_SEARCH_COUNT = 5;
const MAX_SEARCH_COUNT = 10;
const DEFAULT_TIMEOUT_SECONDS = 15;
const DEFAULT_CACHE_TTL_MINUTES = 30;

const BRAVE_SEARCH_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
const DEFAULT_PERPLEXITY_BASE_URL = 'https://openrouter.ai/api/v1';
const PERPLEXITY_DIRECT_BASE_URL = 'https://api.perplexity.ai';
const DEFAULT_PERPLEXITY_MODEL = 'perplexity/sonar-pro';

const BRAVE_FRESHNESS_SHORTCUTS = new Set(['pd', 'pw', 'pm', 'py']);
const BRAVE_FRESHNESS_RANGE = /^(\d{4}-\d{2}-\d{2})to(\d{4}-\d{2}-\d{2})$/;

// =============================================================================
// Cache
// =============================================================================

const SEARCH_CACHE = new Map<string, CacheEntry<Record<string, unknown>>>();

// =============================================================================
// Schema
// =============================================================================

const WebSearchSchema = Type.Object({
  query: Type.String({ description: 'Search query string.' }),
  count: Type.Optional(
    Type.Number({
      description: 'Number of results to return (1-10).',
      minimum: 1,
      maximum: MAX_SEARCH_COUNT,
    }),
  ),
  country: Type.Optional(
    Type.String({
      description: "2-letter country code for region-specific results (e.g., 'DE', 'US', 'ALL'). Default: 'US'.",
    }),
  ),
  search_lang: Type.Optional(
    Type.String({
      description: "ISO language code for search results (e.g., 'de', 'en', 'fr').",
    }),
  ),
  freshness: Type.Optional(
    Type.String({
      description: "Filter results by discovery time (Brave only). Values: 'pd' (past 24h), 'pw' (past week), 'pm' (past month), 'py' (past year), or date range 'YYYY-MM-DDtoYYYY-MM-DD'.",
    }),
  ),
});

// =============================================================================
// Configuration
// =============================================================================

export interface WebSearchConfig {
  /** Search provider to use */
  provider?: SearchProvider;
  /** Brave Search API key */
  braveApiKey?: string;
  /** Perplexity API key */
  perplexityApiKey?: string;
  /** Perplexity base URL */
  perplexityBaseUrl?: string;
  /** Perplexity model to use */
  perplexityModel?: string;
  /** Maximum results per search */
  maxResults?: number;
  /** Timeout in seconds */
  timeoutSeconds?: number;
  /** Cache TTL in minutes */
  cacheTtlMinutes?: number;
}

// =============================================================================
// Types
// =============================================================================

interface BraveSearchResult {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
}

interface BraveSearchResponse {
  web?: {
    results?: BraveSearchResult[];
  };
}

interface PerplexitySearchResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  citations?: string[];
}

// =============================================================================
// Helper Functions
// =============================================================================

function resolveSearchCount(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(1, Math.min(MAX_SEARCH_COUNT, Math.floor(parsed)));
}

function normalizeFreshness(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const lower = trimmed.toLowerCase();
  if (BRAVE_FRESHNESS_SHORTCUTS.has(lower)) return lower;

  const match = trimmed.match(BRAVE_FRESHNESS_RANGE);
  if (!match) return undefined;

  const [, start, end] = match;
  if (!start || !end) return undefined;
  if (!isValidIsoDate(start) || !isValidIsoDate(end)) return undefined;
  if (start > end) return undefined;

  return `${start}to${end}`;
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = value.split('-').map(part => Number.parseInt(part, 10));
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (year === undefined || month === undefined || day === undefined) return false;
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && 
    date.getUTCMonth() === month - 1 && 
    date.getUTCDate() === day
  );
}

function resolveSiteName(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

// =============================================================================
// Search Implementations
// =============================================================================

async function runBraveSearch(params: {
  query: string;
  count: number;
  apiKey: string;
  timeoutSeconds: number;
  country?: string;
  searchLang?: string;
  freshness?: string;
}): Promise<Record<string, unknown>> {
  const url = new URL(BRAVE_SEARCH_ENDPOINT);
  url.searchParams.set('q', params.query);
  url.searchParams.set('count', String(params.count));
  
  if (params.country) {
    url.searchParams.set('country', params.country);
  }
  if (params.searchLang) {
    url.searchParams.set('search_lang', params.searchLang);
  }
  if (params.freshness) {
    url.searchParams.set('freshness', params.freshness);
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': params.apiKey,
    },
    signal: withTimeout(undefined, params.timeoutSeconds * 1000),
  });

  if (!res.ok) {
    const detail = await readResponseText(res);
    throw new Error(`Brave Search API error (${res.status}): ${detail || res.statusText}`);
  }

  const data = (await res.json()) as BraveSearchResponse;
  const results = Array.isArray(data.web?.results) ? (data.web?.results ?? []) : [];
  
  return {
    query: params.query,
    provider: 'brave',
    count: results.length,
    results: results.map(entry => ({
      title: entry.title ?? '',
      url: entry.url ?? '',
      description: entry.description ?? '',
      published: entry.age ?? undefined,
      siteName: resolveSiteName(entry.url ?? ''),
    })),
  };
}

async function runPerplexitySearch(params: {
  query: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutSeconds: number;
}): Promise<Record<string, unknown>> {
  const endpoint = `${params.baseUrl.replace(/\/$/, '')}/chat/completions`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
      'HTTP-Referer': 'https://dome.app',
      'X-Title': 'Dome Web Search',
    },
    body: JSON.stringify({
      model: params.model,
      messages: [{ role: 'user', content: params.query }],
    }),
    signal: withTimeout(undefined, params.timeoutSeconds * 1000),
  });

  if (!res.ok) {
    const detail = await readResponseText(res);
    throw new Error(`Perplexity API error (${res.status}): ${detail || res.statusText}`);
  }

  const data = (await res.json()) as PerplexitySearchResponse;
  
  return {
    query: params.query,
    provider: 'perplexity',
    model: params.model,
    content: data.choices?.[0]?.message?.content ?? 'No response',
    citations: data.citations ?? [],
  };
}

// =============================================================================
// Main Search Function
// =============================================================================

async function runWebSearch(params: {
  query: string;
  count: number;
  provider: SearchProvider;
  braveApiKey?: string;
  perplexityApiKey?: string;
  perplexityBaseUrl?: string;
  perplexityModel?: string;
  timeoutSeconds: number;
  cacheTtlMs: number;
  country?: string;
  searchLang?: string;
  freshness?: string;
}): Promise<Record<string, unknown>> {
  const cacheKey = normalizeCacheKey(
    `${params.provider}:${params.query}:${params.count}:${params.country || 'default'}:${params.searchLang || 'default'}:${params.freshness || 'default'}`,
  );
  
  const cached = readCache(SEARCH_CACHE, cacheKey);
  if (cached) return { ...cached.value, cached: true };

  const start = Date.now();
  let result: Record<string, unknown>;

  if (params.provider === 'perplexity') {
    if (!params.perplexityApiKey) {
      throw new Error('Perplexity API key required');
    }
    
    result = await runPerplexitySearch({
      query: params.query,
      apiKey: params.perplexityApiKey,
      baseUrl: params.perplexityBaseUrl ?? DEFAULT_PERPLEXITY_BASE_URL,
      model: params.perplexityModel ?? DEFAULT_PERPLEXITY_MODEL,
      timeoutSeconds: params.timeoutSeconds,
    });
  } else {
    if (!params.braveApiKey) {
      throw new Error('Brave Search API key required. Set BRAVE_API_KEY environment variable.');
    }
    
    result = await runBraveSearch({
      query: params.query,
      count: params.count,
      apiKey: params.braveApiKey,
      timeoutSeconds: params.timeoutSeconds,
      country: params.country,
      searchLang: params.searchLang,
      freshness: params.freshness,
    });
  }

  result.tookMs = Date.now() - start;
  writeCache(SEARCH_CACHE, cacheKey, result, params.cacheTtlMs);
  
  return result;
}

// =============================================================================
// Tool Factory
// =============================================================================

/**
 * Create a web search tool.
 */
function getEnv(key: string): string | undefined {
  if (typeof process === 'undefined') return undefined;
  return (process as NodeJS.Process).env?.[key];
}

export function createWebSearchTool(config?: WebSearchConfig): AnyAgentTool {
  const provider = config?.provider ?? 'brave';
  const braveApiKey = config?.braveApiKey ?? getEnv('BRAVE_API_KEY');
  const perplexityApiKey = config?.perplexityApiKey ?? getEnv('PERPLEXITY_API_KEY') ?? getEnv('OPENROUTER_API_KEY');
  
  const description = provider === 'perplexity'
    ? 'Search the web using Perplexity Sonar. Returns AI-synthesized answers with citations from real-time web search.'
    : 'Search the web using Brave Search API. Supports region-specific and localized search. Returns titles, URLs, and snippets for fast research.';

  return {
    label: 'Web Search',
    name: 'web_search',
    description,
    parameters: WebSearchSchema,
    execute: async (_toolCallId, args) => {
      try {
        const params = args as Record<string, unknown>;
        const query = readStringParam(params, 'query', { required: true });
        const count = readNumberParam(params, 'count', { integer: true }) ?? config?.maxResults ?? DEFAULT_SEARCH_COUNT;
        const country = readStringParam(params, 'country');
        const searchLang = readStringParam(params, 'search_lang');
        const rawFreshness = readStringParam(params, 'freshness');
        
        // Validate freshness (Brave only)
        if (rawFreshness && provider !== 'brave') {
          return jsonResult({
            status: 'error',
            error: 'freshness is only supported by the Brave web_search provider.',
          });
        }
        
        const freshness = rawFreshness ? normalizeFreshness(rawFreshness) : undefined;
        if (rawFreshness && !freshness) {
          return jsonResult({
            status: 'error',
            error: 'freshness must be one of pd, pw, pm, py, or a range like YYYY-MM-DDtoYYYY-MM-DD.',
          });
        }

        const result = await runWebSearch({
          query,
          count: resolveSearchCount(count, DEFAULT_SEARCH_COUNT),
          provider,
          braveApiKey,
          perplexityApiKey,
          perplexityBaseUrl: config?.perplexityBaseUrl,
          perplexityModel: config?.perplexityModel,
          timeoutSeconds: resolveTimeoutSeconds(config?.timeoutSeconds, DEFAULT_TIMEOUT_SECONDS),
          cacheTtlMs: resolveCacheTtlMs(config?.cacheTtlMinutes, DEFAULT_CACHE_TTL_MINUTES),
          country,
          searchLang,
          freshness,
        });

        return jsonResult(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResult({
          status: 'error',
          error: message,
        });
      }
    },
  };
}
